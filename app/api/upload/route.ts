import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import Message, { IMessage } from '@/models/Message';
import User, { IUser } from '@/models/User';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { corsMiddleware, handleOptions } from '@/lib/cors';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface DecodedToken {
  id: string;
}

interface CloudinaryError {
  http_code?: number;
  message: string;
}

interface UploadResponse {
  message: string;
  fileUrl: string;
  messageDetails: {
    id: mongoose.Types.ObjectId;
    room?: string;
    sender: {
      id: mongoose.Types.ObjectId;
      firstName: string;
      lastName: string;
    };
    receiver?: {
      id: mongoose.Types.ObjectId;
      firstName?: string;
      lastName?: string;
    };
    fileUrl?: string;
    fileType: IMessage['fileType'];
    fileName?: string;
    chatType: IMessage['chatType'];
    isEdited: boolean;
    createdAt: Date;
    replyTo?: IMessage['replyTo'];
    isProfilePictureUpload?: boolean;
  };
}

async function verifyToken(req: NextRequest): Promise<{ id: string } | { error: string; status: number }> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return { error: 'No token provided', status: 401 };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as DecodedToken;
    return { id: decoded.id };
  } catch (error) {
    console.error('Token verification failed:', error);
    return { error: 'Invalid or expired token', status: 401 };
  }
}

export async function OPTIONS(_req: NextRequest) {
  return handleOptions();
}

export async function POST(_req: NextRequest) {
  await dbConnect();

  console.log('POST /api/upload: Incoming upload request.');

  const authResult = await verifyToken(_req);
  if ('error' in authResult) {
    console.log(`POST /api/upload: Authentication failed - ${authResult.error}. Returning ${authResult.status}.`);
    const response = NextResponse.json({ message: authResult.error }, { status: authResult.status });
    return corsMiddleware(_req, response);
  }
  const currentUserId = authResult.id;
  console.log(`POST /api/upload: User ${currentUserId} is authenticated.`);

  try {
    const formData = await _req.formData();
    const file = formData.get('file') as File;
    const room = formData.get('room') as string;
    const senderId = formData.get('senderId') as string;
    const fileType = formData.get('fileType') as IMessage['fileType'];
    const fileName = formData.get('fileName') as string;
    const chatType = formData.get('chatType') as IMessage['chatType'];
    const isProfilePictureUpload = formData.get('isProfilePictureUpload') === 'true';

    const receiverId = formData.get('receiverId') as string | undefined;
    const receiverFirstName = formData.get('receiverFirstName') as string | undefined;
    const receiverLastName = formData.get('receiverLastName') as string | undefined;

    console.log(`POST /api/upload: Received file for room: ${room || 'N/A'}, senderId: ${senderId}, fileType: ${fileType}, chatType: ${chatType}, isProfilePictureUpload: ${isProfilePictureUpload}`);

    if (!file) {
      console.log('POST /api/upload: No file uploaded. Returning 400.');
      const response = NextResponse.json({ message: 'No file uploaded.' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    if (!senderId || !fileType || !chatType) {
      console.log('POST /api/upload: Missing senderId, fileType, or chatType. Returning 400.');
      const response = NextResponse.json({ message: 'Missing senderId, fileType, or chatType.' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    if (chatType === 'room' && !room) {
      console.log('POST /api/upload: Missing room for room chat. Returning 400.');
      const response = NextResponse.json({ message: 'Room is required for room chat.' }, { status: 400 });
      return corsMiddleware(_req, response);
    }
    if (chatType === 'private' && !isProfilePictureUpload && (!receiverId || !receiverFirstName || !receiverLastName)) {
      console.log('POST /api/upload: Missing receiver details for private chat (and not a profile picture upload). Returning 400.');
      const response = NextResponse.json({ message: 'Receiver details are required for private chat.' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    if (senderId !== currentUserId) {
      console.log(`POST /api/upload: Mismatch - senderId (${senderId}) does not match authenticated id (${currentUserId}). Returning 403.`);
      const response = NextResponse.json({ message: 'Unauthorized: Sender ID mismatch.' }, { status: 403 });
      return corsMiddleware(_req, response);
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let resourceType: 'image' | 'video' | 'raw';
    if (file.type.startsWith('image/')) {
      resourceType = 'image';
    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      resourceType = 'video';
    } else {
      resourceType = 'raw';
    }

    console.log(`POST /api/upload: Uploading file to Cloudinary (resource_type: ${resourceType}).`);
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: isProfilePictureUpload ? 'chat_app_profile_pictures' : 'chat_app_messages',
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            return reject(error);
          }
          resolve(result);
        }
      ).end(buffer);
    });

    if (!result || typeof result !== 'object' || !('secure_url' in result)) {
      console.error('Cloudinary upload did not return a secure_url:', result);
      const response = NextResponse.json({ message: 'Failed to get file URL from Cloudinary.' }, { status: 500 });
      return corsMiddleware(_req, response);
    }
    const fileUrl = result.secure_url as string;
    console.log(`POST /api/upload: File uploaded to Cloudinary. URL: ${fileUrl}`);

    const sender = await User.findById(senderId).select('firstName lastName') as IUser | null;
    if (!sender) {
      console.log(`POST /api/upload: Sender user not found for ID: ${senderId}. Returning 404.`);
      const response = NextResponse.json({ message: 'Sender not found.' }, { status: 404 });
      return corsMiddleware(_req, response);
    }

    const newMessageData: Partial<IMessage> = {
      sender: new mongoose.Types.ObjectId(senderId),
      firstName: sender.firstName,
      lastName: sender.lastName,
      fileUrl,
      fileType,
      fileName: fileName || file.name,
      chatType,
      isEdited: false,
      isProfilePictureUpload,
    };

    if (chatType === 'room') {
      newMessageData.room = room;
    } else if (chatType === 'private' && !isProfilePictureUpload) {
      newMessageData.receiver = new mongoose.Types.ObjectId(receiverId as string);
      newMessageData.receiverFirstName = receiverFirstName;
      newMessageData.receiverLastName = receiverLastName;
    }

    const newMessage = new Message(newMessageData);

    await newMessage.save();
    console.log('POST /api/upload: Message saved to DB successfully.');

    if (isProfilePictureUpload) {
      try {
        await User.findByIdAndUpdate(
          senderId,
          { profilePicture: fileUrl },
          { new: true, runValidators: true }
        );
        console.log(`POST /api/upload: User ${senderId} profile picture updated in DB to ${fileUrl}.`);
      } catch (updateError) {
        console.error(`POST /api/upload: Failed to update user profile picture in DB for ${senderId}:`, updateError);
      }
    }

    const response: UploadResponse = {
      message: 'File uploaded and message sent successfully!',
      fileUrl,
      messageDetails: {
        id: newMessage._id,
        room: newMessage.room,
        sender: {
          id: newMessage.sender,
          firstName: newMessage.firstName,
          lastName: newMessage.lastName,
        },
        receiver: newMessage.receiver
          ? {
              id: newMessage.receiver,
              firstName: newMessage.receiverFirstName,
              lastName: newMessage.receiverLastName,
            }
          : undefined,
        fileUrl: newMessage.fileUrl,
        fileType: newMessage.fileType,
        fileName: newMessage.fileName,
        chatType: newMessage.chatType,
        isEdited: newMessage.isEdited,
        createdAt: newMessage.createdAt,
        replyTo: newMessage.replyTo,
        isProfilePictureUpload: newMessage.isProfilePictureUpload,
      },
    };

    const nextResponse = NextResponse.json(response, { status: 200 });
    return corsMiddleware(_req, nextResponse);
  } catch (error: unknown) {
    console.error('POST /api/upload: Server error during upload:', error);
    if (typeof error === 'object' && error !== null && 'http_code' in error && 'message' in error) {
      const response = NextResponse.json({ message: `Cloudinary upload failed: ${(error as CloudinaryError).message}` }, { status: (error as CloudinaryError).http_code });
      return corsMiddleware(_req, response);
    }
    const response = NextResponse.json({ message: 'Internal server error during upload' }, { status: 500 });
    return corsMiddleware(_req, response);
  }
}