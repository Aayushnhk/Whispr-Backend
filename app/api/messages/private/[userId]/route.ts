import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/db/connect';
import Message, { IMessage } from '@/models/Message';
import User, { IUser } from '@/models/User';
import mongoose from 'mongoose';
import { corsMiddleware, handleOptions } from '@/lib/cors';

interface DecodedToken {
  id: string;
}

interface PopulatedMessage {
  _id: mongoose.Types.ObjectId;
  sender: {
    _id: mongoose.Types.ObjectId;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
  receiver?: mongoose.Types.ObjectId;
  receiverFirstName?: string;
  receiverLastName?: string;
  text?: string;
  chatType: 'room' | 'private';
  createdAt: Date;
  isEdited: boolean;
  fileUrl?: string;
  fileType?: IMessage['fileType'];
  fileName?: string;
  replyTo?: {
    id: mongoose.Types.ObjectId;
    sender: string;
    text?: string;
    fileUrl?: string;
    fileType?: string;
    fileName?: string;
  };
}

interface FormattedMessage {
  id: string;
  senderId: string;
  sender: string;
  senderProfilePicture: string;
  receiver: string;
  receiverUsername: string;
  text?: string;
  chatType: 'private';
  timestamp: string;
  isEdited: boolean;
  fileUrl?: string;
  fileType?: IMessage['fileType'];
  fileName?: string;
  replyTo?: {
    id: string;
    sender: string;
    text?: string;
    fileUrl?: string;
    fileType?: string;
    fileName?: string;
  };
}

const decodeToken = (token: string): DecodedToken | null => {
  try {
    console.log('JWT_SECRET (for verification):', process.env.JWT_SECRET ? '****** (present)' : 'NOT SET');
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as DecodedToken;
    return decoded;
  } catch (error) {
    console.error('Token verification failed in decodeToken:', error);
    return null;
  }
};

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  await dbConnect();

  try {
    const authorizationHeader = _req.headers.get('Authorization');
    console.log('GET /api/messages/private/[userId]: Authorization Header received:', authorizationHeader);

    const token = authorizationHeader?.split(' ')[1];
    console.log('GET /api/messages/private/[userId]: Extracted Token (first 10 chars):', token ? token.substring(0, 10) + '...' : 'No Token');

    if (!token) {
      console.log('GET /api/messages/private/[userId]: No token found in Authorization header. Returning 401.');
      const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
      return corsMiddleware(_req, response);
    }

    const decodedToken = decodeToken(token);
    console.log('GET /api/messages/private/[userId]: Decoded Token (after verification):', decodedToken);

    if (!decodedToken || !decodedToken.id) {
      console.log('GET /api/messages/private/[userId]: Decoded token is invalid or missing id. Decoded:', decodedToken);
      const response = NextResponse.json({ message: 'Invalid or expired token, or missing id in token' }, { status: 401 });
      return corsMiddleware(_req, response);
    }

    const currentUserId = new mongoose.Types.ObjectId(decodedToken.id);
    console.log(`GET /api/messages/private/[userId]: currentUserId: ${currentUserId}, otherUserId: ${userId}`);

    const { searchParams } = new URL(_req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = parseInt(searchParams.get('skip') || '0', 10);

    if (!userId) {
      console.log('GET /api/messages/private/[userId]: Missing other user ID from URL path. Returning 400.');
      const response = NextResponse.json({ message: 'Missing other user ID from URL path' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log('GET /api/messages/private/[userId]: Invalid other user ID format. Returning 400.');
      const response = NextResponse.json({ message: 'Invalid other user ID format' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    const objOtherUserId = new mongoose.Types.ObjectId(userId);

    const messages = await Message.find({
      chatType: 'private',
      $or: [
        { sender: currentUserId, receiver: objOtherUserId },
        { sender: objOtherUserId, receiver: currentUserId },
      ],
    })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'sender',
        select: 'firstName lastName profilePicture',
      })
      .select('text sender firstName lastName receiver receiverFirstName receiverLastName chatType createdAt isEdited fileUrl fileType fileName replyTo')
      .lean() as unknown as PopulatedMessage[];

    console.log(`GET /api/messages/private/[userId]: Found ${messages.length} messages`);

    const formattedMessages: FormattedMessage[] = messages.map((msg) => ({
      id: msg._id.toString(),
      senderId: msg.sender._id.toString(),
      sender: `${msg.sender.firstName} ${msg.sender.lastName}`,
      senderProfilePicture: msg.sender.profilePicture || '/default-avatar.png',
      receiver: msg.receiver ? msg.receiver.toString() : '',
      receiverUsername: msg.receiverFirstName && msg.receiverLastName ? `${msg.receiverFirstName} ${msg.receiverLastName}` : '',
      text: msg.text,
      chatType: 'private',
      timestamp: msg.createdAt.toISOString(),
      isEdited: msg.isEdited || false,
      fileUrl: msg.fileUrl,
      fileType: msg.fileType,
      fileName: msg.fileName,
      replyTo: msg.replyTo
        ? {
            id: msg.replyTo.id.toString(),
            sender: msg.replyTo.sender,
            text: msg.replyTo.text,
            fileUrl: msg.replyTo.fileUrl,
            fileType: msg.replyTo.fileType,
            fileName: msg.replyTo.fileName,
          }
        : undefined,
    }));

    const response = NextResponse.json({ messages: formattedMessages }, { status: 200 });
    return corsMiddleware(_req, response);
  } catch (error) {
    console.error('GET /api/messages/private/[userId]: Server error fetching private messages:', error);
    const response = NextResponse.json({ message: 'Server error fetching private messages' }, { status: 500 });
    return corsMiddleware(_req, response);
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  await dbConnect();

  try {
    const authorizationHeader = _req.headers.get('Authorization');
    console.log('POST /api/messages/private/[userId]: Authorization Header received:', authorizationHeader);

    const token = authorizationHeader?.split(' ')[1];
    console.log('POST /api/messages/private/[userId]: Extracted Token (first 10 chars):', token ? token.substring(0, 10) + '...' : 'No Token');

    if (!token) {
      console.log('POST /api/messages/private/[userId]: No token found in Authorization header. Returning 401.');
      const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
      return corsMiddleware(_req, response);
    }

    const decodedToken = decodeToken(token);
    console.log('POST /api/messages/private/[userId]: Decoded Token (after verification):', decodedToken);

    if (!decodedToken?.id) {
      console.log('POST /api/messages/private/[userId]: Decoded token is invalid or missing id. Decoded:', decodedToken);
      const response = NextResponse.json({ message: 'Invalid or expired token, or missing id in token' }, { status: 401 });
      return corsMiddleware(_req, response);
    }

    const receiverId = userId;
    const { text, fileUrl, fileType, fileName, replyTo } = await _req.json();

    console.log(`POST /api/messages/private/[userId]: Sender: ${decodedToken.id}, Receiver: ${receiverId}, Message text: "${text}"`);

    if (!text && !fileUrl) {
      console.log('POST /api/messages/private/[userId]: Message cannot be empty. Returning 400.');
      const response = NextResponse.json({ message: 'Message cannot be empty' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    const sender = await User.findById(decodedToken.id).select('firstName lastName email profilePicture banned') as IUser | null;
    const receiver = await User.findById(receiverId).select('firstName lastName email banned') as IUser | null;

    if (!sender) {
      console.log(`POST /api/messages/private/[userId]: Sender user not found with ID: ${decodedToken.id}. Returning 404.`);
      const response = NextResponse.json({ message: 'Sender user not found' }, { status: 404 });
      return corsMiddleware(_req, response);
    }
    if (!receiver) {
      console.log(`POST /api/messages/private/[userId]: Receiver user not found with ID: ${receiverId}. Returning 404.`);
      const response = NextResponse.json({ message: 'Receiver user not found' }, { status: 404 });
      return corsMiddleware(_req, response);
    }

    if (sender.banned || receiver.banned) {
      console.log(`POST /api/messages/private/[userId]: One or both users (${sender.email} or ${receiver.email}) are banned. Returning 403.`);
      const response = NextResponse.json({ message: 'One or both users are banned' }, { status: 403 });
      return corsMiddleware(_req, response);
    }

    const newMessage = new Message({
      sender: decodedToken.id,
      firstName: sender.firstName,
      lastName: sender.lastName,
      receiver: receiverId,
      receiverFirstName: receiver.firstName,
      receiverLastName: receiver.lastName,
      text,
      chatType: 'private',
      fileUrl,
      fileType,
      fileName,
      replyTo: replyTo
        ? {
            id: new mongoose.Types.ObjectId(replyTo.id),
            sender: replyTo.sender,
            text: replyTo.text,
            fileUrl: replyTo.fileUrl,
            fileType: replyTo.fileType,
            fileName: replyTo.fileName,
          }
        : undefined,
    });

    await newMessage.save();
    console.log('POST /api/messages/private/[userId]: Message saved successfully. Message ID:', newMessage._id);

    const formattedMessage: FormattedMessage = {
      id: newMessage._id.toString(),
      senderId: newMessage.sender.toString(),
      sender: `${newMessage.firstName} ${newMessage.lastName}`,
      senderProfilePicture: sender.profilePicture || '/default-avatar.png',
      receiver: newMessage.receiver?.toString() || '',
      receiverUsername: newMessage.receiverFirstName && newMessage.receiverLastName ? `${newMessage.receiverFirstName} ${newMessage.receiverLastName}` : '',
      text: newMessage.text,
      chatType: 'private',
      timestamp: newMessage.createdAt.toISOString(),
      isEdited: newMessage.isEdited,
      fileUrl: newMessage.fileUrl,
      fileType: newMessage.fileType,
      fileName: newMessage.fileName,
      replyTo: newMessage.replyTo
        ? {
            id: newMessage.replyTo.id.toString(),
            sender: newMessage.replyTo.sender,
            text: newMessage.replyTo.text,
            fileUrl: newMessage.replyTo.fileUrl,
            fileType: newMessage.replyTo.fileType,
            fileName: newMessage.replyTo.fileName,
          }
        : undefined,
    };

    const response = NextResponse.json({ message: formattedMessage }, { status: 201 });
    return corsMiddleware(_req, response);
  } catch (error) {
    console.error('POST /api/messages/private/[userId]: Server error sending private message:', error);
    const response = NextResponse.json({ message: 'Server error sending private message' }, { status: 500 });
    return corsMiddleware(_req, response);
  }
}