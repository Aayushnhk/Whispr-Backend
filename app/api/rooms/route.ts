// src/app/api/rooms/route.ts

import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Room, { IRoom } from '@/models/Room';

// Utility to verify JWT token (copied from upload/route.ts for independence)
async function verifyToken(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return { error: 'No token provided', status: 401 };
  }

  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);
    return { userId: decoded.userId };
  } catch (error: any) {
    console.error('Token verification failed:', error);
    return { error: 'Invalid or expired token', status: 401 };
  }
}

// GET handler to fetch all rooms
export async function GET(req: NextRequest) {
  await dbConnect();
  console.log('GET /api/rooms: Fetching all rooms.');

  const authResult = await verifyToken(req);
  if (authResult.error) {
    console.log(`GET /api/rooms: Authentication failed - ${authResult.error}. Returning ${authResult.status}.`);
    return NextResponse.json({ message: authResult.error }, { status: authResult.status });
  }

  try {
    const rooms = await Room.find({})
      .sort({ createdAt: 1 })
      .select('name _id description creator moderators roomPicture')
      .populate('creator', 'firstName lastName profilePicture')
      .lean();
    console.log(`GET /api/rooms: Found ${rooms.length} rooms.`);
    return NextResponse.json(rooms, { status: 200 });
  } catch (error: any) {
    console.error('GET /api/rooms: Server error during room fetch:', error);
    return NextResponse.json({ message: 'Internal server error', error: error.message }, { status: 500 });
  }
}

// POST handler to create a new room
export async function POST(req: NextRequest) {
  await dbConnect();
  console.log('POST /api/rooms: Incoming request to create a new room.');

  const authResult = await verifyToken(req);
  if (authResult.error) {
    console.log(`POST /api/rooms: Authentication failed - ${authResult.error}. Returning ${authResult.status}.`);
    return NextResponse.json({ message: authResult.error }, { status: authResult.status });
  }
  const currentUserId = authResult.userId;
  console.log(`POST /api/rooms: User ${currentUserId} is authenticated.`);

  try {
    const { roomName, description } = await req.json();

    if (!roomName || roomName.trim() === '') {
      console.log('POST /api/rooms: Room name is empty. Returning 400.');
      return NextResponse.json({ message: 'Room name is required.' }, { status: 400 });
    }

    const existingRoom = await Room.findOne({ name: roomName });
    if (existingRoom) {
      console.log(`POST /api/rooms: Room with name "${roomName}" already exists. Returning 409.`);
      return NextResponse.json({ message: 'Room with this name already exists.' }, { status: 409 });
    }

    const newRoom = new Room({
      name: roomName,
      description: description || '',
      creator: new mongoose.Types.ObjectId(currentUserId),
      moderators: [new mongoose.Types.ObjectId(currentUserId)],
    });

    await newRoom.save();
    console.log(`POST /api/rooms: New room "${newRoom.name}" created by ${currentUserId} with ID: ${newRoom._id}.`);

    return NextResponse.json(
      { message: 'Room created successfully!', room: newRoom },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/rooms: Server error during room creation:', error);
    return NextResponse.json({ message: 'Internal server error', error: error.message }, { status: 500 });
  }
}