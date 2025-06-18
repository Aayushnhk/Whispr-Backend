import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import jwt from 'jsonwebtoken';

interface BanRequest {
  userId: string;
  bannedStatus: boolean;
}

interface DecodedToken {
  id: string;
  role: 'user' | 'admin';
}

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

    if (userToUpdate._id.toString() === authReq.user.id && role === 'user') {
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

export async function PUT(request: NextRequest) {
  await dbConnect();

  try {
    const authorization = request.headers.get('Authorization');
    const token = authorization?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ message: 'No token provided' }, { status: 401 });
    }

    let decodedToken: DecodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET as string) as DecodedToken;
    } catch {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    if (decodedToken.role !== 'admin') {
      return NextResponse.json({ message: 'Access denied: Not an administrator' }, { status: 403 });
    }

    const { userId, bannedStatus }: BanRequest = await request.json();

    if (!userId || typeof bannedStatus !== 'boolean') {
      return NextResponse.json({ message: 'User ID and banned status are required' }, { status: 400 });
    }

    const userToUpdate = await User.findById(userId) as IUser | null;

    if (!userToUpdate) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    if (userToUpdate._id.toString() === decodedToken.id) {
      return NextResponse.json({ message: 'You cannot change your own ban status' }, { status: 403 });
    }

    userToUpdate.banned = bannedStatus;
    await userToUpdate.save();

    return NextResponse.json({
      message: `User ${userToUpdate.firstName} ${userToUpdate.lastName} has been ${bannedStatus ? 'banned' : 'unbanned'}.`,
      user: {
        _id: userToUpdate._id,
        firstName: userToUpdate.firstName,
        lastName: userToUpdate.lastName,
        email: userToUpdate.email,
        role: userToUpdate.role,
        banned: userToUpdate.banned,
        profilePicture: userToUpdate.profilePicture,
        createdAt: userToUpdate.createdAt,
        updatedAt: userToUpdate.updatedAt,
      },
    }, { status: 200 });

  } catch (error) {
    console.error('Error banning/unbanning user:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}