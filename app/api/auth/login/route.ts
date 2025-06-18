import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { corsMiddleware, handleOptions } from '@/lib/cors';

interface LoginRequest {
  email: string;
  password: string;
}

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(_req: NextRequest) {
  await dbConnect();

  console.log('POST /api/auth/login: Incoming login request.');

  try {
    const { email, password }: LoginRequest = await _req.json();
    console.log('POST /api/auth/login: Request body parsed - Email:', email);

    if (!email || !password) {
      console.log('POST /api/auth/login: Missing email or password. Returning 400.');
      const response = NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    const user = await User.findOne({ email }).select('+password') as IUser | null;

    if (!user) {
      console.log('POST /api/auth/login: User not found for email:', email, '. Returning 401.');
      const response = NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
      return corsMiddleware(_req, response);
    }
    console.log('POST /api/auth/login: Found user:', user.email);

    if (!user.password) {
      console.error('POST /api/auth/login: User found but password field is missing or undefined for email:', user.email);
      const response = NextResponse.json({ message: 'Internal server error: Password data missing' }, { status: 500 });
      return corsMiddleware(_req, response);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('POST /api/auth/login: Password mismatch for email:', email, '. Returning 401.');
      const response = NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
      return corsMiddleware(_req, response);
    }
    console.log('POST /api/auth/login: Password matched for user:', user.email);

    if (user.banned) {
      console.log('POST /api/auth/login: User is banned:', user.email, '. Returning 403.');
      const response = NextResponse.json({ message: 'Your account has been banned' }, { status: 403 });
      return corsMiddleware(_req, response);
    }

    console.log('POST /api/auth/login: JWT_SECRET (for signing):', process.env.JWT_SECRET ? '****** (present)' : 'NOT SET');

    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
        role: user.role,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );
    console.log('POST /api/auth/login: Token generated successfully for user:', user.email, '. Token (first 10 chars):', token.substring(0, 10) + '...');

    const response = NextResponse.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profilePicture: user.profilePicture,
        role: user.role,
      },
    }, { status: 200 });

    return corsMiddleware(_req, response);
  } catch (error) {
    console.error('POST /api/auth/login: Server error during login:', error);
    const response = NextResponse.json({ message: 'Internal server error during login' }, { status: 500 });
    return corsMiddleware(_req, response);
  }
}