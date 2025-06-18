// src/app/api/admin/ban/route.ts
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
  await dbConnect();

  try {
    const authorization = request.headers.get('Authorization');
    const token = authorization?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ message: 'No token provided' }, { status: 401 });
    }

    let decodedToken: any;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET as string);
    } catch (err) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    // Check if the authenticated user is an admin
    if (decodedToken.role !== 'admin') {
      return NextResponse.json({ message: 'Access denied: Not an administrator' }, { status: 403 });
    }

    const { userId, bannedStatus } = await request.json();

    if (!userId || typeof bannedStatus !== 'boolean') {
      return NextResponse.json({ message: 'User ID and banned status are required' }, { status: 400 });
    }

    const userToUpdate = await User.findById(userId) as IUser | null;

    if (!userToUpdate) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Prevent an admin from banning/unbanning themselves
    if ((userToUpdate._id as any).toString() === decodedToken.id) {
      return NextResponse.json({ message: 'You cannot change your own ban status' }, { status: 403 });
    }

    userToUpdate.banned = bannedStatus;
    await userToUpdate.save();

    return NextResponse.json({
      message: `User ${userToUpdate.firstName} ${userToUpdate.lastName} has been ${bannedStatus ? 'banned' : 'unbanned'}.`,
      user: {
        _id: userToUpdate._id,
        firstName: userToUpdate.firstName,
        lastName: userToUpdate.lastName,
        email: userToUpdate.email,
        role: userToUpdate.role,
        banned: userToUpdate.banned,
        profilePicture: userToUpdate.profilePicture,
        createdAt: userToUpdate.createdAt,
        updatedAt: userToUpdate.updatedAt,
      },
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error banning/unbanning user:', error);
    return NextResponse.json({ message: error.message || 'Internal server error' }, { status: 500 });
  }
}