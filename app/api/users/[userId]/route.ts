import { NextRequest, NextResponse } from 'next/server';
import connect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import { verifyToken } from '@/lib/auth';

interface DecodedToken {
  userId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  await connect();

  try {
    const { userId } = params;

    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }
    const decoded = verifyToken(token) as DecodedToken | null;
    if (!decoded) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json({ message: 'User ID is required' }, { status: 400 });
    }

    const user = await User.findById(userId).select('-password') as IUser | null;

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user }, { status: 200 });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}