import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import jwt from 'jsonwebtoken';
import Room, { IRoom } from '@/models/Room';
import { uploadFileToCloudinary, deleteFileFromCloudinary, getCloudinaryResourceType } from '@/lib/cloudinary-upload';
import { corsMiddleware, handleOptions } from '@/lib/cors';

interface DecodedToken {
  userId: string;
  role: 'user' | 'admin';
}

interface MongoError {
  name?: string;
  errors?: Record<string, { message: string }>;
}

async function verifyToken(req: NextRequest): Promise<{ userId: string; role: 'user' | 'admin' } | { error: string; status: number }> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return { error: 'No token provided', status: 401 };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as DecodedToken;
    return { userId: decoded.userId, role: decoded.role || 'user' };
  } catch (error) {
    console.error('Token verification failed:', error);
    return { error: 'Invalid or expired token', status: 401 };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function OPTIONS(_req: NextRequest) {
  return handleOptions();
}

export async function PUT(_req: NextRequest) {
  await dbConnect();

  const roomId = _req.nextUrl.pathname.split('/').pop();
  if (!roomId) {
    const response = NextResponse.json({ message: 'Room ID is required' }, { status: 400 });
    return corsMiddleware(_req, response);
  }
  console.log(`PUT /api/rooms/${roomId}: Incoming request to update room.`);

  const authResult = await verifyToken(_req);
  if ('error' in authResult) {
    console.log(`PUT /api/rooms/${roomId}: Authentication failed - ${authResult.error}. Returning ${authResult.status}.`);
    const response = NextResponse.json({ message: authResult.error }, { status: authResult.status });
    return corsMiddleware(_req, response);
  }

  const { userId: currentUserId, role: currentUserRole } = authResult;
  console.log(`PUT /api/rooms/${roomId}: User ${currentUserId} (${currentUserRole}) authenticated.`);

  let requestData: FormData;
  try {
    requestData = await _req.formData();
  } catch (error: unknown) {
    console.error(`PUT /api/rooms/${roomId}: Failed to parse form data:`, getErrorMessage(error));
    const response = NextResponse.json({ message: 'Invalid form data in request body.' }, { status: 400 });
    return corsMiddleware(_req, response);
  }

  const name = requestData.get('roomName')?.toString();
  const description = requestData.get('description')?.toString();
  const roomPictureFile = requestData.get('roomPicture') as File | null;
  const clearPicture = requestData.get('clearPicture') === 'true';

  if (!name || name.trim() === '') {
    console.log(`PUT /api/rooms/${roomId}: Room name is required. Returning 400.`);
    const response = NextResponse.json({ message: 'Room name is required.' }, { status: 400 });
    return corsMiddleware(_req, response);
  }

  try {
    const room = await Room.findById(roomId) as IRoom | null;

    if (!room) {
      console.log(`PUT /api/rooms/${roomId}: Room not found. Returning 404.`);
      const response = NextResponse.json({ message: 'Room not found.' }, { status: 404 });
      return corsMiddleware(_req, response);
    }

    const isCreator = room.creator && room.creator.toString() === currentUserId;
    const isAdmin = currentUserRole === 'admin';

    if (!isCreator && !isAdmin) {
      console.log(`PUT /api/rooms/${roomId}: Unauthorized access by user ${currentUserId}. Returning 403.`);
      const response = NextResponse.json({ message: 'Forbidden: Only the room creator or an admin can update this room.' }, { status: 403 });
      return corsMiddleware(_req, response);
    }

    const updateFields: Partial<IRoom> = {};
    updateFields.name = name.trim();
    updateFields.description = description ? description.trim() : null;

    let newRoomPictureUrl = room.roomPicture;

    if (clearPicture) {
      if (room.roomPicture && room.roomPicture !== '/default-room-avatar.png') {
        console.log(`PUT /api/rooms/${roomId}: Clearing existing room picture. Deleting from Cloudinary.`);
        await deleteFileFromCloudinary(room.roomPicture);
      }
      newRoomPictureUrl = '/default-room-avatar.png';
    } else if (roomPictureFile && roomPictureFile.size > 0) {
      console.log(`PUT /api/rooms/${roomId}: New room picture provided.`);
      if (room.roomPicture && room.roomPicture !== '/default-room-avatar.png') {
        console.log(`PUT /api/rooms/${roomId}: Deleting old room picture from Cloudinary.`);
        await deleteFileFromCloudinary(room.roomPicture);
      }
      const resourceType = getCloudinaryResourceType(roomPictureFile.type);
      newRoomPictureUrl = await uploadFileToCloudinary(roomPictureFile, 'chat_app_room_pictures', resourceType);
      console.log(`PUT /api/rooms/${roomId}: New room picture uploaded to Cloudinary. URL: ${newRoomPictureUrl}`);
    }

    updateFields.roomPicture = newRoomPictureUrl;

    const updatedRoom = await Room.findByIdAndUpdate(
      roomId,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate('creator', 'firstName lastName profilePicture') as IRoom | null;

    if (!updatedRoom) {
      console.error(`PUT /api/rooms/${roomId}: Room disappeared during update.`);
      const response = NextResponse.json({ message: 'Room update failed, room not found after initial check.' }, { status: 500 });
      return corsMiddleware(_req, response);
    }

    console.log(`PUT /api/rooms/${roomId}: Room updated successfully with ID: ${updatedRoom._id}.`);
    const response = NextResponse.json(updatedRoom, { status: 200 });
    return corsMiddleware(_req, response);
  } catch (error: unknown) {
    const mongoError = error as MongoError;
    if (mongoError.name === 'CastError') {
      console.error(`PUT /api/rooms/${roomId}: Invalid Room ID format.`, error);
      const response = NextResponse.json({ message: 'Invalid room ID format.' }, { status: 400 });
      return corsMiddleware(_req, response);
    }
    if (mongoError.name === 'ValidationError') {
      const messages = Object.values(mongoError.errors || {}).map((err) => (err as { message: string }).message);
      console.error(`PUT /api/rooms/${roomId}: Validation error:`, messages);
      const response = NextResponse.json({ message: 'Validation Error', errors: messages }, { status: 400 });
      return corsMiddleware(_req, response);
    }
    console.error(`PUT /api/rooms/${roomId}: Server error during room update:`, getErrorMessage(error));
    const response = NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    return corsMiddleware(_req, response);
  }
}

export async function DELETE(_req: NextRequest) {
  await dbConnect();

  const roomId = _req.nextUrl.pathname.split('/').pop();
  if (!roomId) {
    const response = NextResponse.json({ message: 'Room ID is required' }, { status: 400 });
    return corsMiddleware(_req, response);
  }
  console.log(`DELETE /api/rooms/${roomId}: Incoming request to delete room.`);

  const authResult = await verifyToken(_req);
  if ('error' in authResult) {
    console.log(`DELETE /api/rooms/${roomId}: Authentication failed - ${authResult.error}. Returning ${authResult.status}.`);
    const response = NextResponse.json({ message: authResult.error }, { status: authResult.status });
    return corsMiddleware(_req, response);
  }

  const { userId: currentUserId, role: currentUserRole } = authResult;
  console.log(`DELETE /api/rooms/${roomId}: User ${currentUserId} (${currentUserRole}) authenticated.`);

  try {
    const room = await Room.findById(roomId) as IRoom | null;

    if (!room) {
      console.log(`DELETE /api/rooms/${roomId}: Room not found. Returning 404.`);
      const response = NextResponse.json({ message: 'Room not found.' }, { status: 404 });
      return corsMiddleware(_req, response);
    }

    const isCreator = room.creator.toString() === currentUserId;
    const isAdmin = currentUserRole === 'admin';

    if (!isCreator && !isAdmin) {
      console.log(`DELETE /api/rooms/${roomId}: Unauthorized access by user ${currentUserId}. Returning 403.`);
      const response = NextResponse.json({ message: 'Forbidden: Only the room creator or an admin can delete this room.' }, { status: 403 });
      return corsMiddleware(_req, response);
    }

    if (room.roomPicture && room.roomPicture !== '/default-room-avatar.png') {
      console.log(`DELETE /api/rooms/${roomId}: Deleting room picture from Cloudinary.`);
      await deleteFileFromCloudinary(room.roomPicture);
    }

    await room.deleteOne();
    console.log(`DELETE /api/rooms/${roomId}: Room deleted successfully.`);
    const response = NextResponse.json({ message: 'Room deleted successfully.' }, { status: 200 });
    return corsMiddleware(_req, response);
  } catch (error: unknown) {
    const mongoError = error as MongoError;
    if (mongoError.name === 'CastError') {
      console.error(`DELETE /api/rooms/${roomId}: Invalid Room ID format.`, error);
      const response = NextResponse.json({ message: 'Invalid room ID format.' }, { status: 400 });
      return corsMiddleware(_req, response);
    }
    console.error(`DELETE /api/rooms/${roomId}: Server error during room deletion:`, getErrorMessage(error));
    const response = NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    return corsMiddleware(_req, response);
  }
}