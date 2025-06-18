import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import Message from '@/models/Message';
import User from '@/models/User';

export async function GET(req: NextRequest) {
  await dbConnect();

  try {
    const { searchParams } = new URL(req.url);
    const room = searchParams.get('room');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const receiverId = searchParams.get('receiverId');
    const senderId = searchParams.get('senderId');

    let query: any = {};
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
      return NextResponse.json({ message: 'Room or sender/receiver parameters are required' }, { status: 400 });
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
      .lean();

    const formattedMessages = messages.map((msg: any) => ({
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
      fileUrl: msg.fileUrl || undefined,
      fileType: msg.fileType || undefined,
      fileName: msg.fileName || undefined,
      replyTo: msg.replyTo ? {
        id: msg.replyTo.id.toString(),
        sender: msg.replyTo.sender,
        text: msg.replyTo.text || undefined,
        fileUrl: msg.replyTo.fileUrl || undefined,
        fileType: msg.replyTo.fileType || undefined,
        fileName: msg.replyTo.fileName || undefined,
      } : undefined,
    }));

    return NextResponse.json({ messages: formattedMessages }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}