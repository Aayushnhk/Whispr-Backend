import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User from '@/models/User';

export async function POST(req: NextRequest) {
  await dbConnect();

  try {
    const { firstName, lastName, email, password } = await req.json();

    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json({ message: 'Please enter all fields' }, { status: 400 });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ message: 'This email address is already registered.' }, { status: 409 });
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

    return NextResponse.json({ message: 'User registered successfully', userId: newUser._id }, { status: 201 });

  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ message: 'Server error during registration' }, { status: 500 });
  }
}