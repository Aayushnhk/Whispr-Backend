import { NextRequest, NextResponse } from 'next/server';
import User, { IUser } from '@/models/User';
import connect from '@/lib/db/connect';
import { verifyToken } from '@/lib/auth';
import { corsMiddleware, handleOptions } from '@/lib/cors';

export async function OPTIONS(_req: NextRequest) {
  return handleOptions();
}

export async function GET(_req: NextRequest) {
  try {
    await connect();
  } catch (dbError) {
    console.error('Database connection failed for /api/auth/check:', dbError);
    const response = NextResponse.json({ message: 'Database connection error' }, { status: 500 });
    return corsMiddleware(_req, response);
  }
  console.log('Connected to MongoDB for /api/auth/check');

  const authHeader = _req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('No authorization header or invalid format.');
    const response = NextResponse.json({ message: 'Unauthorized: No token provided' }, { status: 401 });
    return corsMiddleware(_req, response);
  }

  const token = authHeader.split(' ')[1];

  const decodedToken = verifyToken(token);

  if (!decodedToken) {
    console.warn('Token verification failed via utility.');
    const response = NextResponse.json({ message: 'Unauthorized: Invalid or expired token' }, { status: 401 });
    return corsMiddleware(_req, response);
  }

  const userId = decodedToken.id;
  if (!userId) {
    console.warn('Decoded token missing id.');
    const response = NextResponse.json({ message: 'Unauthorized: Invalid token payload' }, { status: 401 });
    return corsMiddleware(_req, response);
  }

  const user = await User.findById(userId).select('-password') as IUser | null;
  if (!user || user.banned) {
    console.warn('User not found or banned for provided token ID.');
    const response = NextResponse.json({ message: 'Unauthorized: User not found or banned' }, { status: 401 });
    return corsMiddleware(_req, response);
  }

  const response = NextResponse.json({
    message: 'Token is valid',
    user: {
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profilePicture: user.profilePicture,
      role: user.role,
      banned: user.banned,
    },
  }, { status: 200 });

  return corsMiddleware(_req, response);
}