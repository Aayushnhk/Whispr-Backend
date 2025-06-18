import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import { corsMiddleware, handleOptions } from '@/lib/cors';

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
    const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    return corsMiddleware(req, response);
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error('JWT_SECRET is not defined in environment variables.');
    const response = NextResponse.json({ message: 'Server configuration error' }, { status: 500 });
    return corsMiddleware(req, response);
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as { id: string; firstName: string; lastName: string; role: 'user' | 'admin' };
    req.user = decoded;
    return undefined;
  } catch (error) {
    console.error('JWT verification failed:', error);
    const response = NextResponse.json({ message: 'Invalid or expired token' }, { status: 401 });
    return corsMiddleware(req, response);
  }
};

export async function OPTIONS(_req: NextRequest) {
  return handleOptions();
}

export async function GET(_req: NextRequest) {
  await dbConnect();

  const authResponse = await authenticateAndAuthorize(_req as AuthNextRequest);
  if (authResponse) {
    return authResponse;
  }

  const authReq = _req as AuthNextRequest;

  if (authReq.user?.role !== 'admin') {
    const response = NextResponse.json({ message: 'Access denied: Admin role required' }, { status: 403 });
    return corsMiddleware(_req, response);
  }

  try {
    const users = await User.find({}, 'username email role profilePicture banned firstName lastName createdAt updatedAt');
    const response = NextResponse.json({ users }, { status: 200 });
    return corsMiddleware(_req, response);
  } catch (error) {
    console.error('Error fetching users:', error);
    const response = NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    return corsMiddleware(_req, response);
  }
}

export async function POST(_req: NextRequest) {
  await dbConnect();

  const authResponse = await authenticateAndAuthorize(_req as AuthNextRequest);
  if (authResponse) {
    return authResponse;
  }

  const authReq = _req as AuthNextRequest;

  if (authReq.user?.role !== 'admin') {
    const response = NextResponse.json({ message: 'Access denied: Admin role required' }, { status: 403 });
    return corsMiddleware(_req, response);
  }

  try {
    const { userId, role } = await _req.json();

    if (!userId || !role) {
      const response = NextResponse.json({ message: 'User ID and role are required' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    if (!['user', 'admin'].includes(role)) {
      const response = NextResponse.json({ message: 'Invalid role specified. Must be "user" or "admin".' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    const userToUpdate = await User.findById(userId) as IUser | null;

    if (!userToUpdate) {
      const response = NextResponse.json({ message: 'User not found' }, { status: 404 });
      return corsMiddleware(_req, response);
    }

    if ((userToUpdate._id as unknown as { toString: () => string }).toString() === authReq.user.id && role === 'user') {
      const response = NextResponse.json({ message: "Cannot demote yourself to a regular user." }, { status: 403 });
      return corsMiddleware(_req, response);
    }

    userToUpdate.role = role;
    await userToUpdate.save();

    const response = NextResponse.json({
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

    return corsMiddleware(_req, response);
  } catch (error) {
    console.error('Error updating user role:', error);
    const response = NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    return corsMiddleware(_req, response);
  }
}