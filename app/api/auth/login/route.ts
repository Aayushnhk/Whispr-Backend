import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

interface LoginRequest {
  email: string;
  password: string;
}

export async function POST(req: NextRequest) {
  await dbConnect();

  console.log('POST /api/auth/login: Incoming login request.');

  try {
    const { email, password }: LoginRequest = await req.json();
    console.log('POST /api/auth/login: Request body parsed - Email:', email);

    if (!email || !password) {
      console.log('POST /api/auth/login: Missing email or password. Returning 400.');
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
    }

    const user = await User.findOne({ email }).select('+password') as IUser | null;

    if (!user) {
      console.log('POST /api/auth/login: User not found for email:', email, '. Returning 401.');
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }
    console.log('POST /api/auth/login: Found user:', user.email);

    if (!user.password) {
      console.error('POST /api/auth/login: User found but password field is missing or undefined for email:', user.email);
      return NextResponse.json({ message: 'Internal server error: Password data missing' }, { status: 500 });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('POST /api/auth/login: Password mismatch for email:', email, '. Returning 401.');
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }
    console.log('POST /api/auth/login: Password matched for user:', user.email);

    if (user.banned) {
      console.log('POST /api/auth/login: User is banned:', user.email, '. Returning 403.');
      return NextResponse.json({ message: 'Your account has been banned' }, { status: 403 });
    }

    console.log('POST /api/auth/login: JWT_SECRET (for signing):', process.env.JWT_SECRET ? '****** (present)' : 'NOT SET');

    const token = jwt.sign(
      {
        id: user._id.toString(), // Changed from userId to id
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

    return NextResponse.json({
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
  } catch (error) {
    console.error('POST /api/auth/login: Server error during login:', error);
    return NextResponse.json({ message: 'Internal server error during login' }, { status: 500 });
  }
}