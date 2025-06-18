// app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User from '@/models/User';
import { corsMiddleware, handleOptions } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  return handleOptions();
}

export async function POST(req: NextRequest) {
  await dbConnect();

  try {
    const { firstName, lastName, email, password } = await req.json();

    if (!firstName || !lastName || !email || !password) {
      const response = NextResponse.json({ message: 'Please enter all fields' }, { status: 400 });
      return corsMiddleware(req, response);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const response = NextResponse.json({ message: 'This email address is already registered.' }, { status: 409 });
      return corsMiddleware(req, response);
    }

    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password,
      profilePicture: '/default-avatar.png',
      role: 'user',
      banned: false,
    });

    const response = NextResponse.json({ message: 'User registered successfully', userId: newUser._id }, { status: 201 });
    return corsMiddleware(req, response);
  } catch (error: unknown) {
    console.error('Registration error:', error);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      const response = NextResponse.json({ message: 'This email address is already registered.' }, { status: 409 });
      return corsMiddleware(req, response);
    }
    const response = NextResponse.json({ message: 'Server error during registration' }, { status: 500 });
    return corsMiddleware(req, response);
  }
}