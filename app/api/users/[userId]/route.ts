// src/app/api/users/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import connect from '@/lib/db/connect';
import User from '@/models/User'; // Assuming your User model path
import { verifyToken } from '@/lib/auth'; // Assuming you have an auth verification utility

// Establish database connection
connect();

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    // Optional: Verify authentication if only logged-in users can view profiles
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json({ message: 'User ID is required' }, { status: 400 });
    }

    const user = await User.findById(userId).select('-password'); // Exclude password

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user });

  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
}