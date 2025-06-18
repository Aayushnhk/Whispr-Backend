import { NextRequest, NextResponse } from 'next/server';
import { generateToken, verifyToken } from '@/lib/auth';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';

export async function POST(req: NextRequest) {
  await dbConnect();

  try {
    const { refreshToken } = await req.json();
    if (!refreshToken) {
      return NextResponse.json(
        { message: 'Refresh token is required' },
        { status: 400 }
      );
    }

    const decoded = verifyToken(refreshToken, true);
    if (!decoded || !decoded.userId) {
      return NextResponse.json(
        { message: 'Invalid refresh token' },
        { status: 401 }
      );
    }

    const user = await User.findById(decoded.userId).select('+refreshToken').exec() as IUser | null;
    if (!user || user.refreshToken !== refreshToken) {
      return NextResponse.json(
        { message: 'Invalid refresh token' },
        { status: 401 }
      );
    }

    const newToken = generateToken({ userId: user._id.toString() });
    const newRefreshToken = generateToken(
      { userId: user._id.toString() },
      '7d',
      true
    );

    user.refreshToken = newRefreshToken;
    await user.save();

    return NextResponse.json({
      token: newToken,
      refreshToken: newRefreshToken,
    }, { status: 200 });

  } catch (error) {
    console.error('Refresh token error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}