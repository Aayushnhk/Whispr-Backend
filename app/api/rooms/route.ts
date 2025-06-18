// app/api/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Room from '@/models/Room';
import { corsMiddleware, handleOptions } from '@/lib/cors';

interface DecodedToken {
 userId: string;
}

interface RoomRequest {
 roomName: string;
 description?: string;
}

async function verifyToken(req: NextRequest): Promise<{ userId: string } | { error: string; status: number }> {
 const authHeader = req.headers.get('authorization');
 const token = authHeader && authHeader.split(' ')[1];

 if (!token) {
 return { error: 'No token provided', status: 401 };
 }

 try {
 const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as DecodedToken;
 return { userId: decoded.userId };
 } catch (error) {
 console.error('Token verification failed:', error);
 return { error: 'Invalid or expired token', status: 401 };
 }
}

export async function OPTIONS(req: NextRequest) {
 return handleOptions();
}

export async function GET(req: NextRequest) {
 await dbConnect();
 console.log('GET /api/rooms: Fetching all rooms.');

 const authResult = await verifyToken(req);
 if ('error' in authResult) {
 console.log(`GET /api/rooms: Authentication failed - ${authResult.error}. Returning ${authResult.status}.`);
 const response = NextResponse.json({ message: authResult.error }, { status: authResult.status });
 return corsMiddleware(req, response);
 }

 try {
 const rooms = await Room.find({})
 .sort({ createdAt: 1 })
 .select('name _id description creator moderators roomPicture')
 .populate('creator', 'firstName lastName profilePicture')
 .lean();
 console.log(`GET /api/rooms: Found ${rooms.length} rooms.`);
 const response = NextResponse.json(rooms, { status: 200 });
 return corsMiddleware(req, response);
 } catch (error) {
 console.error('GET /api/rooms: Server error during room fetch:', error);
 const response = NextResponse.json({ message: 'Internal server error' }, { status: 500 });
 return corsMiddleware(req, response);
 }
}

export async function POST(req: NextRequest) {
 await dbConnect();
 console.log('POST /api/rooms: Incoming request to create a new room.');

 const authResult = await verifyToken(req);
 if ('error' in authResult) {
 console.log(`POST /api/rooms: Authentication failed - ${authResult.error}. Returning ${authResult.status}.`);
 const response = NextResponse.json({ message: authResult.error }, { status: authResult.status });
 return corsMiddleware(req, response);
 }
 const currentUserId = authResult.userId;
 console.log(`POST /api/rooms: User ${currentUserId} is authenticated.`);

 try {
 const { roomName, description }: RoomRequest = await req.json();

 if (!roomName || roomName.trim() === '') {
 console.log('POST /api/rooms: Room name is empty. Returning 400.');
 const response = NextResponse.json({ message: 'Room name is required.' }, { status: 400 });
 return corsMiddleware(req, response);
 }

 const existingRoom = await Room.findOne({ name: roomName });
 if (existingRoom) {
 console.log(`POST /api/rooms: Room with name "${roomName}" already exists. Returning 409.`);
 const response = NextResponse.json({ message: 'Room with this name already exists.' }, { status: 409 });
 return corsMiddleware(req, response);
 }

 const newRoom = new Room({
 name: roomName,
 description: description || '',
 creator: new mongoose.Types.ObjectId(currentUserId),
 moderators: [new mongoose.Types.ObjectId(currentUserId)],
 });

 await newRoom.save();
 console.log(`POST /api/rooms: New room "${newRoom.name}" created by ${currentUserId} with ID: ${newRoom._id}.`);

 const response = NextResponse.json(
 { message: 'Room created successfully!', room: newRoom },
 { status: 201 }
 );
 return corsMiddleware(req, response);
 } catch (error) {
 console.error('POST /api/rooms: Server error during room creation:', error);
 const response = NextResponse.json({ message: 'Internal server error' }, { status: 500 });
 return corsMiddleware(req, response);
 }
}