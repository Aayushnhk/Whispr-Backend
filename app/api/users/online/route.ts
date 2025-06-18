// src/app/api/users/online/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User from '@/models/User';
import { authMiddleware } from '@/lib/auth';
import mongoose from 'mongoose';

export async function POST(req: NextRequest) {
  await dbConnect();

  const authResult = authMiddleware(req);
  if (authResult.error) {
    return NextResponse.json(
      { message: authResult.error },
      { status: authResult.status || 401 }
    );
  }

  try {
    const body = await req.json();
    if (!body?.userIds || !Array.isArray(body.userIds)) {
      return NextResponse.json(
        { message: 'User IDs array is required' },
        { status: 400 }
      );
    }

    const validUserIds = body.userIds.filter((id: string) =>
      mongoose.Types.ObjectId.isValid(id)
    );

    if (validUserIds.length === 0) {
      return NextResponse.json(
        { message: 'No valid user IDs provided' },
        { status: 400 }
      );
    }

    const users = await User.find(
      { _id: { $in: validUserIds } },
      { _id: 1, firstName: 1, lastName: 1, profilePicture: 1 }
    ).lean();

    return NextResponse.json({
      users: users.map(user => ({
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture || ''
      }))
    }, { status: 200 });

  } catch (error) {
    console.error('Error in /api/users/online:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}