import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

interface LoginRequest {
  email: string;
  password: string;
}

export async function OPTIONS(req: NextRequest) {
  console.log('OPTIONS /api/auth/login: Handling preflight request.');
  const response = NextResponse.json({}, { status: 200 });
  const allowedOrigins = ['https://whispr-o7.vercel.app', 'http://localhost:3000'];
  const origin = req.headers.get('origin');
  
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else {
    response.headers.set('Access-Control-Allow-Origin', 'https://whispr-o7.vercel.app');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '86400');
  
  return response;
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

    const allowedOrigins = ['https://whispr-o7.vercel.app', 'http://localhost:3000'];
    const origin = req.headers.get('origin');
    console.log('POST /api/auth/login: Request Origin:', origin);
    
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    } else {
      response.headers.set('Access-Control-Allow-Origin', 'https://whispr-o7.vercel.app');
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    response.headers.set('Access-Control-Allow-Credentials', 'true');

    return response;
  } catch (error) {
    console.error('POST /api/auth/login: Server error during login:', error);
    return NextResponse.json({ message: 'Internal server error during login' }, { status: 500 });
  }
}