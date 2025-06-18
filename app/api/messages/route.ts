// app/api/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import Message, { IMessage } from '@/models/Message';
import mongoose from 'mongoose';
import { corsMiddleware, handleOptions } from '@/lib/cors';

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
 room?: string;
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
 text?: string;
 timestamp: string;
 isEdited: boolean;
 chatType: IMessage['chatType'];
 room?: string;
 receiverId?: string;
 receiverUsername?: string;
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

export async function OPTIONS(req: NextRequest) {
 return handleOptions();
}

export async function GET(req: NextRequest) {
 await dbConnect();

 try {
 const { searchParams } = new URL(req.url);
 const room = searchParams.get('room');
 const limit = parseInt(searchParams.get('limit') || '50', 10);
 const skip = parseInt(searchParams.get('skip') || '0', 10);
 const receiverId = searchParams.get('receiverId');
 const senderId = searchParams.get('senderId');

 const query: { room?: string; chatType?: 'room' | 'private'; $or?: Array<{ sender: string; receiver: string }> } = {};
 if (room) {
 query.room = room;
 query.chatType = 'room';
 } else if (senderId && receiverId) {
 query.$or = [
 { sender: senderId, receiver: receiverId },
 { sender: receiverId, receiver: senderId },
 ];
 query.chatType = 'private';
 } else {
 const response = NextResponse.json({ message: 'Room or sender/receiver parameters are required' }, { status: 400 });
 return corsMiddleware(req, response);
 }

 const messages = await Message.find(query)
 .sort({ createdAt: 1 })
 .skip(skip)
 .limit(limit)
 .populate({
 path: 'sender',
 select: 'firstName lastName profilePicture',
 })
 .select('text sender firstName lastName receiver receiverFirstName receiverLastName chatType createdAt isEdited fileUrl fileType fileName replyTo')
 .lean() as unknown as PopulatedMessage[];

 const formattedMessages: FormattedMessage[] = messages.map((msg) => ({
 id: msg._id.toString(),
 senderId: msg.sender._id.toString(),
 sender: `${msg.sender.firstName} ${msg.sender.lastName}`,
 senderProfilePicture: msg.sender.profilePicture || '/default-avatar.png',
 text: msg.text || undefined,
 timestamp: msg.createdAt.toISOString(),
 isEdited: msg.isEdited || false,
 chatType: msg.chatType,
 room: msg.room || undefined,
 receiverId: msg.receiver ? msg.receiver.toString() : undefined,
 receiverUsername: msg.receiverFirstName && msg.receiverLastName ? `${msg.receiverFirstName} ${msg.receiverLastName}` : undefined,
 fileUrl: msg.fileUrl || undefined ,
 fileType: msg.fileType || undefined,
 fileName: msg.fileName || undefined,
 replyTo: msg.replyTo
 ? {
 id: msg.replyTo.id.toString(),
 sender: msg.replyTo.sender,
 text: msg.replyTo.text || undefined,
 fileUrl: msg.replyTo.fileUrl || undefined,
 fileType: msg.replyTo.fileType || undefined,
 fileName: msg.replyTo.fileName || undefined,
 }
 : undefined,
 }));

 const response = NextResponse.json({ messages: formattedMessages }, { status: 200 });
 return corsMiddleware(req, response);
 } catch (error) {
 console.error('Error fetching messages:', error);
 const response = NextResponse.json({ message: 'Internal server error' }, { status: 500 });
 return corsMiddleware(req, response);
 }
}