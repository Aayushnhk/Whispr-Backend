import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';

interface AuthNextRequest extends NextRequest {
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    role: 'user' | 'admin';
  };
}

const authenticateAndAuthorize = async (req: AuthNextRequest): Promise<NextResponse | undefined> => {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error('JWT_SECRET is not defined in environment variables.');
    return NextResponse.json({ message: 'Server configuration error' }, { status: 500 });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as { id: string; firstName: string; lastName: string; role: 'user' | 'admin' };
    req.user = decoded;
    return undefined;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return NextResponse.json({ message: 'Invalid or expired token' }, { status: 401 });
  }
};

export async function GET(req: NextRequest) {
  await dbConnect();

  const authResponse = await authenticateAndAuthorize(req as AuthNextRequest);
  if (authResponse) {
    return authResponse;
  }

  const authReq = req as AuthNextRequest;

  if (authReq.user?.role !== 'admin') {
    return NextResponse.json({ message: 'Access denied: Admin role required' }, { status: 403 });
  }

  try {
    const users = await User.find({}, 'username email role profilePicture banned firstName lastName createdAt updatedAt');
    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await dbConnect();

  const authResponse = await authenticateAndAuthorize(req as AuthNextRequest);
  if (authResponse) {
    return authResponse;
  }

  const authReq = req as AuthNextRequest;

  if (authReq.user?.role !== 'admin') {
    return NextResponse.json({ message: 'Access denied: Admin role required' }, { status: 403 });
  }

  try {
    const { userId, role } = await req.json();

    if (!userId || !role) {
      return NextResponse.json({ message: 'User ID and role are required' }, { status: 400 });
    }

    if (!['user', 'admin'].includes(role)) {
      return NextResponse.json({ message: 'Invalid role specified. Must be "user" or "admin".' }, { status: 400 });
    }

    const userToUpdate = await User.findById(userId) as IUser | null;

    if (!userToUpdate) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    if ((userToUpdate._id as unknown as { toString: () => string }).toString() === authReq.user.id && role === 'user') {
      return NextResponse.json({ message: "Cannot demote yourself to a regular user." }, { status: 403 });
    }

    userToUpdate.role = role;
    await userToUpdate.save();

    return NextResponse.json({
      message: `User ${userToUpdate.firstName} ${userToUpdate.lastName} role updated to ${role}`,
      user: {
        id: userToUpdate._id,
        firstName: userToUpdate.firstName,
        lastName: userToUpdate.lastName,
        email: userToUpdate.email,
        role: userToUpdate.role,
        profilePicture: userToUpdate.profilePicture,
        banned: userToUpdate.banned,
        createdAt: userToUpdate.createdAt,
        updatedAt: userToUpdate.updatedAt,
      },
    }, { status: 200 });

  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}