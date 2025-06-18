import { NextRequest, NextResponse } from 'next/server'; // Fixed import: Added NextRequest
import User, { IUser } from '@/models/User';
import connect from '@/lib/db/connect';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) { // Changed Request to NextRequest
  try {
    await connect();
  } catch (dbError) {
    console.error('Database connection failed for /api/auth/check:', dbError);
    return NextResponse.json({ message: 'Database connection error' }, { status: 500 });
  }
  console.log('Connected to MongoDB for /api/auth/check');

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('No authorization header or invalid format.');
    return NextResponse.json({ message: 'Unauthorized: No token provided' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];

  const decodedToken = verifyToken(token);

  if (!decodedToken) {
    console.warn('Token verification failed via utility.');
    return NextResponse.json({ message: 'Unauthorized: Invalid or expired token' }, { status: 401 });
  }

  const userId = decodedToken.id;
  if (!userId) {
    console.warn('Decoded token missing id.');
    return NextResponse.json({ message: 'Unauthorized: Invalid token payload' }, { status: 401 });
  }

  const user = await User.findById(userId).select('-password') as IUser | null;
  if (!user || user.banned) {
    console.warn('User not found or banned for provided token ID.');
    return NextResponse.json({ message: 'Unauthorized: User not found or banned' }, { status: 401 });
  }

  return NextResponse.json({
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
}