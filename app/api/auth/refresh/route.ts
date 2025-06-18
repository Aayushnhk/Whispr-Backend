import { NextRequest, NextResponse } from 'next/server';
import { generateToken, verifyToken } from '@/lib/auth';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import { corsMiddleware, handleOptions } from '@/lib/cors';

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(_req: NextRequest) {
  await dbConnect();

  try {
    const { refreshToken } = await _req.json();
    if (!refreshToken) {
      const response = NextResponse.json(
        { message: 'Refresh token is required' },
        { status: 400 }
      );
      return corsMiddleware(_req, response);
    }

    const decoded = verifyToken(refreshToken, true);
    if (!decoded || !decoded.userId) {
      const response = NextResponse.json(
        { message: 'Invalid refresh token' },
        { status: 401 }
      );
      return corsMiddleware(_req, response);
    }

    const user = await User.findById(decoded.userId).select('+refreshToken').exec() as IUser | null;
    if (!user || user.refreshToken !== refreshToken) {
      const response = NextResponse.json(
        { message: 'Invalid refresh token' },
        { status: 401 }
      );
      return corsMiddleware(_req, response);
    }

    const newToken = generateToken({ userId: user._id.toString() });
    const newRefreshToken = generateToken(
      { userId: user._id.toString() },
      '7d',
      true
    );

    user.refreshToken = newRefreshToken;
    await user.save();

    const response = NextResponse.json({
      token: newToken,
      refreshToken: newRefreshToken,
    }, { status: 200 });

    return corsMiddleware(_req, response);
  } catch (error) {
    console.error('Refresh token error:', error);
    const response = NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
    return corsMiddleware(_req, response);
  }
}