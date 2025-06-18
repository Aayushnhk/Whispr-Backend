// app/api/auth/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateToken, verifyToken } from '@/lib/auth';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import { corsMiddleware, handleOptions } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  return handleOptions();
}

export async function POST(req: NextRequest) {
  await dbConnect();

  try {
    const { refreshToken } = await req.json();
    if (!refreshToken) {
      const response = NextResponse.json(
        { message: 'Refresh token is required' },
        { status: 400 }
      );
      return corsMiddleware(req, response);
    }

    const decoded = verifyToken(refreshToken, true);
    if (!decoded || !decoded.userId) {
      const response = NextResponse.json(
        { message: 'Invalid refresh token' },
        { status: 401 }
      );
      return corsMiddleware(req, response);
    }

    const user = await User.findById(decoded.userId).select('+refreshToken').exec() as IUser | null;
    if (!user || user.refreshToken !== refreshToken) {
      const response = NextResponse.json(
        { message: 'Invalid refresh token' },
        { status: 401 }
      );
      return corsMiddleware(req, response);
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

    return corsMiddleware(req, response);
  } catch (error) {
    console.error('Refresh token error:', error);
    const response = NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
    return corsMiddleware(req, response);
  }
}