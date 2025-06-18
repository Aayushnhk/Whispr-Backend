import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import Message from '@/models/Message';
import User from '@/models/User';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const decodeToken = (token: string) => {
  try {
    console.log('JWT_SECRET (for verification):', process.env.JWT_SECRET ? '****** (present)' : 'NOT SET');
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    return decoded;
  } catch (error) {
    console.error('Token verification failed in decodeToken:', error);
    return null;
  }
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  await dbConnect();

  try {
    const authorizationHeader = request.headers.get('Authorization');
    console.log('GET /api/messages/private/[userId]: Authorization Header received:', authorizationHeader);

    const token = authorizationHeader?.split(' ')[1];
    console.log('GET /api/messages/private/[userId]: Extracted Token (first 10 chars):', token ? token.substring(0, 10) + '...' : 'No Token');

    if (!token) {
      console.log('GET /api/messages/private/[userId]: No token found in Authorization header. Returning 401.');
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    const decodedToken: any = decodeToken(token);
    console.log('GET /api/messages/private/[userId]: Decoded Token (after verification):', decodedToken);

    if (!decodedToken || typeof decodedToken !== 'object' || !decodedToken.userId) {
      console.log('GET /api/messages/private/[userId]: Decoded token is invalid or missing userId. Decoded:', decodedToken);
      return NextResponse.json({ message: 'Invalid or expired token, or missing userId in token' }, { status: 401 });
    }

    const currentUserId = new mongoose.Types.ObjectId(decodedToken.userId);
    console.log(`GET /api/messages/private/[userId]: currentUserId: ${currentUserId}, otherUserId: ${userId}`);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = parseInt(searchParams.get('skip') || '0', 10);

    if (!userId) {
      console.log('GET /api/messages/private/[userId]: Missing other user ID from URL path. Returning 400.');
      return NextResponse.json({ message: 'Missing other user ID from URL path' }, { status: 400 });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log('GET /api/messages/private/[userId]: Invalid other user ID format. Returning 400.');
      return NextResponse.json({ message: 'Invalid other user ID format' }, { status: 400 });
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
      .lean();

    console.log(`GET /api/messages/private/[userId]: Found ${messages.length} messages.`);

    const formattedMessages = messages.map((msg: any) => ({
      ...msg,
      id: msg._id.toString(),
      senderId: msg.sender._id.toString(),
      sender: `${msg.sender.firstName} ${msg.sender.lastName}`,
      senderProfilePicture: msg.sender.profilePicture || '/default-avatar.png',
      receiver: msg.receiver ? msg.receiver.toString() : '',
      senderUsername: `${msg.firstName || ''} ${msg.lastName || ''}`.trim(),
      receiverUsername: msg.receiverFirstName && msg.receiverLastName ? `${msg.receiverFirstName} ${msg.receiverLastName}` : '',
      replyTo: msg.replyTo ? {
        id: msg.replyTo.id.toString(),
        sender: msg.replyTo.sender,
        text: msg.replyTo.text,
        fileUrl: msg.replyTo.fileUrl,
        fileType: msg.replyTo.fileType,
        fileName: msg.replyTo.fileName,
      } : undefined,
    }));

    return NextResponse.json({ messages: formattedMessages }, { status: 200 });
  } catch (error: any) {
    console.error('GET /api/messages/private/[userId]: Server error fetching private messages:', error);
    return NextResponse.json({ message: 'Server error fetching private messages', error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  await dbConnect();
  try {
    const authorizationHeader = req.headers.get('Authorization');
    console.log('POST /api/messages/private/[userId]: Authorization Header received:', authorizationHeader);

    const token = authorizationHeader?.split(' ')[1];
    console.log('POST /api/messages/private/[userId]: Extracted Token (first 10 chars):', token ? token.substring(0, 10) + '...' : 'No Token');

    if (!token) {
      console.log('POST /api/messages/private/[userId]: No token found in Authorization header. Returning 401.');
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    const decodedToken: any = decodeToken(token);
    console.log('POST /api/messages/private/[userId]: Decoded Token (after verification):', decodedToken);

    if (!decodedToken || typeof decodedToken !== 'object' || !decodedToken.userId) {
      console.log('POST /api/messages/private/[userId]: Decoded token is invalid or missing userId. Decoded:', decodedToken);
      return NextResponse.json({ message: 'Invalid or expired token, or missing userId in token' }, { status: 401 });
    }

    const receiverId = userId;
    const { text, fileUrl, fileType, fileName, replyTo } = await req.json();

    console.log(`POST /api/messages/private/[userId]: Sender: ${decodedToken.userId}, Receiver: ${receiverId}, Message text: "${text}"`);

    if (!text && !fileUrl) {
      console.log('POST /api/messages/private/[userId]: Message cannot be empty. Returning 400.');
      return NextResponse.json({ message: 'Message cannot be empty' }, { status: 400 });
    }

    const sender = await User.findById(decodedToken.userId);
    const receiver = await User.findById(receiverId);

    if (!sender) {
      console.log(`POST /api/messages/private/[userId]: Sender user not found with ID: ${decodedToken.userId}. Returning 404.`);
      return NextResponse.json({ message: 'Sender user not found' }, { status: 404 });
    }
    if (!receiver) {
      console.log(`POST /api/messages/private/[userId]: Receiver user not found with ID: ${receiverId}. Returning 404.`);
      return NextResponse.json({ message: 'Receiver user not found' }, { status: 404 });
    }

    if (sender.banned || receiver.banned) {
      console.log(`POST /api/messages/private/[userId]: One or both users (${sender.email} or ${receiver.email}) are banned. Returning 403.`);
      return NextResponse.json({ message: 'One or both users are banned' }, { status: 403 });
    }

    const newMessage = new Message({
      sender: decodedToken.userId,
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
      replyTo: replyTo ? {
        id: new mongoose.Types.ObjectId(replyTo.id),
        sender: replyTo.sender,
        text: replyTo.text,
        fileUrl: replyTo.fileUrl,
        fileType: replyTo.fileType,
        fileName: replyTo.fileName,
      } : undefined,
    });

    await newMessage.save();
    console.log('POST /api/messages/private/[userId]: Message saved successfully. Message ID:', newMessage._id);

    const formattedMessage = {
      id: newMessage._id.toString(),
      sender: newMessage.sender.toString(),
      senderId: newMessage.sender.toString(),
      senderFirstName: newMessage.firstName,
      senderLastName: newMessage.lastName,
      senderProfilePicture: sender.profilePicture || '/default-avatar.png',
      receiverId: newMessage.receiver ? newMessage.receiver.toString() : '',
      receiver: newMessage.receiverFirstName && newMessage.receiverLastName ? `${newMessage.receiverFirstName} ${newMessage.receiverLastName}` : '',
      text: newMessage.text,
      chatType: newMessage.chatType,
      timestamp: newMessage.createdAt.toISOString(),
      isEdited: newMessage.isEdited,
      fileUrl: newMessage.fileUrl,
      fileType: newMessage.fileType,
      fileName: newMessage.fileName,
      replyTo: newMessage.replyTo ? {
        id: newMessage.replyTo.id.toString(),
        sender: newMessage.replyTo.sender,
        text: newMessage.replyTo.text,
        fileUrl: newMessage.replyTo.fileUrl,
        fileType: newMessage.replyTo.fileType,
        fileName: newMessage.replyTo.fileName,
      } : undefined,
    };

    return NextResponse.json({ message: formattedMessage }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/messages/private/[userId]: Server error sending private message:', error);
    return NextResponse.json({ message: 'Server error sending private message', error: error.message }, { status: 500 });
  }
}