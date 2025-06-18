require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DEBUG = 'socket.io:*';

import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { connect } from 'mongoose';
import path from 'path';
import Message, { IMessage } from './models/Message';
import User, { IUser } from './models/User';

declare module 'socket.io' {
  interface Socket {
    userId?: string;
    firstName?: string;
    lastName?: string;
    activeRooms: Set<string>;
  }
}

interface JoinPrivateRoomArgs {
  senderId: string;
  senderFirstName: string;
  senderLastName: string;
  receiverId: string;
  receiverFirstName?: string;
  receiverLastName?: string;
}

interface PrivateMessageArgs {
  id: string;
  senderId: string;
  senderFirstName: string;
  senderLastName: string;
  receiverId: string;
  receiverFirstName: string;
  receiverLastName: string;
  text?: string;
  fileUrl?: string;
  fileType?: 'image' | 'video' | 'audio' | 'document' | 'other';
  fileName?: string;
  replyTo?: {
    id: string;
    sender: string;
    text?: string;
    fileUrl?: string;
    fileType?: 'image' | 'video' | 'audio' | 'document' | 'other';
    fileName?: string;
  };
}

interface SendMessageArgs {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  text?: string;
  room: string;
  fileUrl?: string;
  fileType?: 'image' | 'video' | 'audio' | 'document' | 'other';
  fileName?: string;
  replyTo?: {
    id: string;
    sender: string;
    text?: string;
    fileUrl?: string;
    fileType?: 'image' | 'video' | 'audio' | 'document' | 'other';
    fileName?: string;
  };
}

interface TypingArgs {
  room?: string;
  firstName: string;
  lastName: string;
  senderId?: string;
  receiverId?: string;
}

interface EditMessageArgs {
  messageId: string;
  newText: string;
  userId: string;
}

interface DeleteMessageArgs {
  messageId: string;
  userId: string;
}

interface GetPrivateMessagesArgs {
  user1Id: string;
  user2Id: string;
}

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [process.env.NEXT_PUBLIC_URL || 'http://localhost:4000', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.SOCKET_SERVER_PORT || 4001;
const MONGODB_URI = process.env.MONGODB_URI;
const NEXT_PUBLIC_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:4000';

if (!MONGODB_URI) {
  process.exit(1);
}
if (!NEXT_PUBLIC_URL) {
  process.exit(1);
}

const users = new Map<
  string,
  { userId: string; firstName: string; lastName: string; currentRoom: string | null }
>();
const usersInPublicRooms = new Map<string, Set<string>>();
const usersInPrivateRooms = new Map<string, Set<string>>();
const userSockets = new Map<string, Set<string>>();
const typingUsers = new Map<string, Set<string>>();
const globalOnlineUsers = new Map<string, { userId: string; fullName: string; profilePicture: string; }>();

const getPrivateRoomId = (userId1: string, userId2: string): string => {
  const sortedIds = [userId1, userId2].sort();
  return `private_${sortedIds[0]}_${sortedIds[1]}`;
};

io.use((socket: Socket, next) => {
  socket.onAny((event, ...args) => {});
  next();
});

io.on('connection', (socket: Socket) => {
  socket.activeRooms = new Set();

  socket.on(
    'registerUser',
    async (userId: string, firstName: string, lastName: string, profilePicture?: string) => {
      if (!userId || userId === 'undefined' || !firstName || !lastName) {
        socket.emit('error', 'Invalid registration data: userId, firstName, and lastName are required');
        return;
      }

      try {
        const userDoc = await User.findById(userId);
        if (!userDoc) {
          socket.emit('error', 'User not found');
          return;
        }
        if (userDoc.banned) {
          socket.emit('error', 'User is banned');
          return;
        }
        if (userDoc.profilePicture === undefined || userDoc.profilePicture === null) {
          userDoc.profilePicture = '/default-avatar.png';
          await userDoc.save();
        }

        socket.userId = userId;
        socket.firstName = firstName;
        socket.lastName = lastName;

        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set());
        }
        userSockets.get(userId)!.add(socket.id);

        const fullName = `${firstName} ${lastName}`;
        const profilePictureValue = profilePicture || userDoc.profilePicture || '/default-avatar.png';

        if (!globalOnlineUsers.has(userId)) {
          globalOnlineUsers.set(userId, { userId, fullName, profilePicture: profilePictureValue });
          io.emit('onlineUsers', Array.from(globalOnlineUsers.values()));
        }
        socket.emit('onlineUsers', Array.from(globalOnlineUsers.values()));
      } catch (error) {
        socket.emit('error', 'Failed to verify user');
        return;
      }
    }
  );

  socket.on(
    'joinRoom',
    async (room: string, userId: string, firstName: string, lastName: string) => {
      if (!room || !userId || userId === 'undefined' || !firstName || !lastName) {
        socket.emit('error', 'Invalid join data: room, userId, firstName, and lastName are required');
        return;
      }

      try {
        const userDoc = await User.findById(userId);
        if (!userDoc || userDoc.banned) {
          socket.emit('error', userDoc ? 'User is banned' : 'User not found');
          return;
        }
        if (userDoc.profilePicture === undefined || userDoc.profilePicture === null) {
          userDoc.profilePicture = '/default-avatar.png';
          await userDoc.save();
        }
      } catch (error) {
        socket.emit('error', 'Failed to verify user');
        return;
      }

      if (!socket.userId || socket.userId !== userId) {
        socket.userId = userId;
        socket.firstName = firstName;
        socket.lastName = lastName;

        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set());
        }
        userSockets.get(userId)!.add(socket.id);
      }

      const previousPublicRoom = users.get(socket.id)?.currentRoom;
      if (previousPublicRoom && previousPublicRoom !== room) {
        socket.leave(previousPublicRoom);
        socket.activeRooms.delete(previousPublicRoom);
        const prevRoomUsers = usersInPublicRooms.get(previousPublicRoom);
        if (prevRoomUsers) {
          const fullName = `${socket.firstName} ${socket.lastName}`;
          prevRoomUsers.delete(fullName);
          io.to(previousPublicRoom).emit('userLeft', {
            username: fullName,
            room: previousPublicRoom,
          });
        }
        if (typingUsers.has(previousPublicRoom)) {
          const fullName = `${socket.firstName} ${socket.lastName}`;
          typingUsers.get(previousPublicRoom)!.delete(fullName);
          io.to(previousPublicRoom).emit('userStoppedTyping', {
            username: fullName,
            room: previousPublicRoom,
          });
        }
      }

      socket.join(room);
      socket.activeRooms.add(room);
      const fullName = `${firstName} ${lastName}`;
      users.set(socket.id, { userId, firstName, lastName, currentRoom: room });

      if (!usersInPublicRooms.has(room)) {
        usersInPublicRooms.set(room, new Set());
      }
      usersInPublicRooms.get(room)!.add(fullName);

      socket.to(room).emit('userJoined', {
        username: fullName,
        room,
      });

      if (!globalOnlineUsers.has(userId)) {
        const userDoc = await User.findById(userId);
        const profilePicture = userDoc?.profilePicture || '/default-avatar.png';
        globalOnlineUsers.set(userId, { userId, fullName, profilePicture });
        io.emit('onlineUsers', Array.from(globalOnlineUsers.values()));
      }
      socket.emit('onlineUsers', Array.from(globalOnlineUsers.values()));
    }
  );

  socket.on(
    'joinPrivateRoom',
    async (
      {
        senderId,
        senderFirstName,
        senderLastName,
        receiverId,
        receiverFirstName,
        receiverLastName,
      }: JoinPrivateRoomArgs,
      callback: (response: { success: boolean; message?: string; room?: string; userId?: string; error?: string }) => void
    ) => {
      if (!senderId || !receiverId || !senderFirstName || !senderLastName) {
        callback({ success: false, error: 'Invalid private room data' });
        return;
      }

      try {
        const sender = await User.findById(senderId);
        const receiver = await User.findById(receiverId);
        if (!sender || !receiver) {
          callback({ success: false, error: 'User not found' });
          return;
        }
        if (sender.banned || receiver.banned) {
          callback({ success: false, error: 'One or both users are banned' });
          return;
        }
        if (sender.profilePicture === undefined || sender.profilePicture === null) {
          sender.profilePicture = '/default-avatar.png';
          await sender.save();
        }
        if (receiver.profilePicture === undefined || receiver.profilePicture === null) {
          receiver.profilePicture = '/default-avatar.png';
          await receiver.save();
        }
      } catch (error) {
        callback({ success: false, error: 'Failed to validate users' });
        return;
      }

      const senderFullName = `${senderFirstName} ${senderLastName}`;
      const privateRoomId = getPrivateRoomId(senderId, receiverId);

      if (!socket.activeRooms.has(privateRoomId)) {
        socket.join(privateRoomId);
        socket.activeRooms.add(privateRoomId);
        socket.userId = senderId;
        socket.firstName = senderFirstName;
        socket.lastName = senderLastName;

        if (!usersInPrivateRooms.has(privateRoomId)) {
          usersInPrivateRooms.set(privateRoomId, new Set());
        }
        usersInPrivateRooms.get(privateRoomId)!.add(senderId);
      }

      const fetchReceiverDetails = async () => {
        try {
          const receiverUser = await User.findById(receiverId);
          if (receiverUser) {
            return {
              firstName: receiverUser.firstName,
              lastName: receiverUser.lastName,
            };
          }
          return { firstName: 'Unknown', lastName: '' };
        } catch (error) {
          return { firstName: 'Unknown', lastName: '' };
        }
      };

      (async () => {
        let updatedFirstName = receiverFirstName;
        let updatedLastName = receiverLastName;

        if (!receiverFirstName || !receiverLastName) {
          const receiverDetails = await fetchReceiverDetails();
          updatedFirstName = receiverDetails.firstName;
          updatedLastName = receiverDetails.lastName;
        }

        const receiverFullName = `${updatedFirstName} ${updatedLastName}`;
        const receiverSockets = userSockets.get(receiverId);
        if (receiverSockets) {
          receiverSockets.forEach((receiverSocketId) => {
            const receiverSocket = io.sockets.sockets.get(receiverSocketId);
            if (receiverSocket && !receiverSocket.activeRooms.has(privateRoomId)) {
              receiverSocket.join(privateRoomId);
              receiverSocket.activeRooms.add(privateRoomId);
              if (!usersInPrivateRooms.has(privateRoomId)) {
                usersInPrivateRooms.set(privateRoomId, new Set());
              }
              usersInPrivateRooms.get(privateRoomId)!.add(receiverId);
            }
          });
        }

        callback({ success: true, message: 'Joined private room', room: privateRoomId, userId: senderId });
      })();
    }
  );

  socket.on(
    'leavePrivateRoom',
    ({ senderId, receiverId }: { senderId: string; receiverId: string }) => {
      if (!senderId || !receiverId) {
        socket.emit('error', 'Invalid leave data');
        return;
      }

      const privateRoomId = getPrivateRoomId(senderId, receiverId);
      if (socket.activeRooms.has(privateRoomId)) {
        socket.leave(privateRoomId);
        socket.activeRooms.delete(privateRoomId);
        if (usersInPrivateRooms.has(privateRoomId)) {
          usersInPrivateRooms.get(privateRoomId)!.delete(senderId);
        }
      }
    }
  );

  socket.on(
    'sendMessage',
    async ({
      id,
      userId,
      firstName,
      lastName,
      text,
      room,
      fileUrl,
      fileType,
      fileName,
      replyTo,
    }: SendMessageArgs) => {
      if (!text && !fileUrl) {
        socket.emit('messageError', 'Message cannot be empty.');
        return;
      }

      try {
        const userDoc = await User.findById(userId);
        if (!userDoc || userDoc.banned) {
          socket.emit('error', userDoc ? 'User is banned' : 'User not found');
          return;
        }
      } catch (error) {
        socket.emit('error', 'Failed to verify user');
        return;
      }

      const fullName = `${firstName} ${lastName}`;
      try {
        let replyToData;
        if (replyTo && replyTo.id) {
          const repliedMessage = await Message.findById(replyTo.id);
          if (!repliedMessage) {
            socket.emit('messageError', 'Replied message not found.');
            return;
          }
          replyToData = {
            id: repliedMessage._id,
            sender: replyTo.sender || `${repliedMessage.firstName} ${repliedMessage.lastName}`,
            text: replyTo.text || repliedMessage.text,
            fileUrl: replyTo.fileUrl || repliedMessage.fileUrl,
            fileType: replyTo.fileType || repliedMessage.fileType,
            fileName: replyTo.fileName || repliedMessage.fileName,
          };
        }

        const newMessage = new Message({
          sender: userId,
          firstName,
          lastName,
          room,
          text: text || undefined,
          chatType: 'room',
          fileUrl: fileUrl || undefined,
          fileType: fileType || undefined,
          fileName: fileName || undefined,
          replyTo: replyToData || undefined,
        });
        await newMessage.save();

        if (typingUsers.has(room)) {
          typingUsers.get(room)!.delete(fullName);
          socket.to(room).emit('userStoppedTyping', { username: fullName, room });
        }

        io.to(room).emit('receiveMessage', {
          _id: newMessage._id.toString(),
          id: id,
          sender: fullName,
          senderId: userId,
          text: newMessage.text,
          timestamp: newMessage.createdAt.toISOString(),
          room: newMessage.room,
          chatType: newMessage.chatType,
          isEdited: newMessage.isEdited || false,
          fileUrl: newMessage.fileUrl || undefined,
          fileType: newMessage.fileType || undefined,
          fileName: newMessage.fileName || undefined,
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
        });
      } catch (error: any) {
        socket.emit('messageError', 'Failed to send message.');
      }
    }
  );

  socket.on(
    'privateMessage',
    async (
      {
        id,
        senderId,
        senderFirstName,
        senderLastName,
        receiverId,
        receiverFirstName,
        receiverLastName,
        text,
        fileUrl,
        fileType,
        fileName,
        replyTo,
      }: PrivateMessageArgs,
      callback: (response: { success: boolean; messageId?: string; error?: string }) => void
    ) => {
      if (!text && !fileUrl) {
        callback({ success: false, error: 'Private message cannot be empty.' });
        return;
      }

      if (!senderId || !receiverId || !senderFirstName || !senderLastName) {
        callback({ success: false, error: 'Invalid message data.' });
        return;
      }

      try {
        const sender = await User.findById(senderId);
        const receiver = await User.findById(receiverId);
        if (!sender || !receiver) {
          callback({ success: false, error: 'User not found' });
          return;
        }
        if (sender.banned || receiver.banned) {
          callback({ success: false, error: 'One or both users are banned' });
          return;
        }
      } catch (error) {
        callback({ success: false, error: 'Failed to verify users' });
        return;
      }

      const senderFullName = `${senderFirstName} ${senderLastName}`;
      const privateRoomId = getPrivateRoomId(senderId, receiverId);

      const fetchReceiverDetails = async () => {
        try {
          const receiverUser = await User.findById(receiverId);
          if (receiverUser) {
            return {
              firstName: receiverUser.firstName,
              lastName: receiverUser.lastName,
            };
          }
          return { firstName: 'Unknown', lastName: '' };
        } catch (error) {
          return { firstName: 'Unknown', lastName: '' };
        }
      };

      try {
        let updatedFirstName = receiverFirstName;
        let updatedLastName = receiverLastName;

        if (!receiverFirstName || !receiverLastName) {
          const receiverDetails = await fetchReceiverDetails();
          updatedFirstName = receiverDetails.firstName;
          updatedLastName = receiverDetails.lastName;
        }

        const receiverFullName = `${updatedFirstName} ${updatedLastName}`;

        let replyToData;
        if (replyTo && replyTo.id) {
          const repliedMessage = await Message.findById(replyTo.id);
          if (!repliedMessage) {
            callback({ success: false, error: 'Replied message not found.' });
            return;
          }
          replyToData = {
            id: repliedMessage._id,
            sender: replyTo.sender || `${repliedMessage.firstName} ${repliedMessage.lastName}`,
            text: replyTo.text || repliedMessage.text,
            fileUrl: replyTo.fileUrl || repliedMessage.fileUrl,
            fileType: replyTo.fileType || repliedMessage.fileType,
            fileName: replyTo.fileName || repliedMessage.fileName,
          };
        }

        const newMessage = new Message({
          sender: senderId,
          firstName: senderFirstName,
          lastName: senderLastName,
          receiver: receiverId,
          receiverFirstName: updatedFirstName,
          receiverLastName: updatedLastName,
          text: text || undefined,
          chatType: 'private',
          fileUrl: fileUrl || undefined,
          fileType: fileType || undefined,
          fileName: fileName || undefined,
          replyTo: replyToData || undefined,
        });
        await newMessage.save();

        const messageToSend = {
          _id: newMessage._id.toString(),
          id: id,
          senderId,
          senderUsername: senderFullName,
          text: newMessage.text,
          timestamp: newMessage.createdAt.toISOString(),
          chatType: newMessage.chatType,
          receiverId,
          receiverUsername: receiverFullName,
          receiverFirstName: newMessage.receiverFirstName,
          receiverLastName: newMessage.receiverLastName,
          isEdited: newMessage.isEdited || false,
          fileUrl: newMessage.fileUrl || undefined,
          fileType: newMessage.fileType || undefined,
          fileName: newMessage.fileName || undefined,
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

        socket.emit('receivePrivateMessage', messageToSend);
        if (usersInPrivateRooms.has(privateRoomId)) {
          io.to(privateRoomId).emit('receivePrivateMessage', messageToSend);
        }

        if (userSockets.has(receiverId)) {
          const receiverSocketIds = userSockets.get(receiverId)!;
          const notificationContent = text || `[File: ${fileName || 'Shared File'}]`;
          for (const receiverSocketId of receiverSocketIds) {
            const receiverSocket = io.sockets.sockets.get(receiverSocketId);
            if (receiverSocket && !receiverSocket.rooms.has(privateRoomId)) {
              receiverSocket.emit('privateMessageNotification', {
                senderId,
                senderUsername: senderFullName,
                messageSnippet:
                  notificationContent.length > 100
                    ? notificationContent.substring(0, 97) + '...'
                    : notificationContent,
                fullMessageId: messageToSend._id,
                chatType: 'private',
                timestamp: messageToSend.timestamp,
                fileUrl: messageToSend.fileUrl,
                fileType: messageToSend.fileType,
                fileName: messageToSend.fileName,
              });
            }
          }
        }

        callback({ success: true, messageId: newMessage._id.toString() });
      } catch (error: any) {
        callback({ success: false, error: 'Failed to send private message.' });
      }
    }
  );

  socket.on(
    'getPrivateMessages',
    async ({ user1Id, user2Id }: GetPrivateMessagesArgs) => {
      if (!user1Id || !user2Id) {
        socket.emit('messageError', 'Invalid user IDs');
        return;
      }

      try {
        const privateRoomId = getPrivateRoomId(user1Id, user2Id);
        const messages = await Message.find({
          $or: [
            { sender: user1Id, receiver: user2Id, chatType: 'private' },
            { sender: user2Id, receiver: user1Id, chatType: 'private' },
          ],
        }).lean();
        const formattedMessages = messages.map((m) => ({
          _id: m._id.toString(),
          id: m._id.toString(),
          senderId: m.sender.toString(),
          senderUsername: `${m.firstName} ${m.lastName}`,
          text: m.text,
          timestamp: m.createdAt.toISOString(),
          receiverId: m.receiver?.toString(),
          receiverUsername:
            m.receiverFirstName && m.receiverLastName
              ? `${m.receiverFirstName} ${m.receiverLastName}`
              : undefined,
          receiverFirstName: m.receiverFirstName,
          receiverLastName: m.receiverLastName,
          chatType: m.chatType,
          isEdited: m.isEdited || false,
          fileUrl: m.fileUrl || undefined,
          fileType: m.fileType || undefined,
          fileName: m.fileName || undefined,
          replyTo: m.replyTo
            ? {
                id: m.replyTo.id.toString(),
                sender: m.replyTo.sender,
                text: m.replyTo.text,
                fileUrl: m.replyTo.fileUrl,
                fileType: m.replyTo.fileType,
                fileName: m.replyTo.fileName,
              }
            : undefined,
        }));
        socket.emit('historicalPrivateMessages', formattedMessages);
      } catch (error: any) {
        socket.emit('messageError', 'Failed to fetch private messages.');
      }
    }
  );

  socket.on(
    'editMessage',
    async ({ messageId, newText, userId }: EditMessageArgs) => {
      try {
        const message = await Message.findById(messageId);

        if (!message) {
          socket.emit('messageError', 'Message not found.');
          return;
        }

        if (message.sender.toString() !== userId) {
          socket.emit('messageError', 'Not authorized to edit this message.');
          return;
        }

        if (message.fileUrl && (!newText || newText.trim() === '')) {
          socket.emit('messageError', 'Cannot edit a message that is solely a file.');
          return;
        }

        message.text = newText;
        message.isEdited = true;
        await message.save();

        const fullSenderName = `${message.firstName} ${message.lastName}`;
        const fullReceiverName =
          message.receiverFirstName && message.receiverLastName
            ? `${message.receiverFirstName} ${message.lastName}`
            : undefined;

        const updatedMessageData = {
          _id: message._id.toString(),
          id: message._id.toString(),
          senderId: message.sender.toString(),
          senderUsername: fullSenderName,
          text: message.text,
          timestamp: message.createdAt.toISOString(),
          isEdited: true,
          chatType: message.chatType,
          room: message.room || undefined,
          receiverId: message.receiver?.toString(),
          receiverUsername: fullReceiverName,
          receiverFirstName: message.receiverFirstName,
          receiverLastName: message.receiverLastName,
          fileUrl: message.fileUrl || undefined,
          fileType: message.fileType || undefined,
          fileName: message.fileName || undefined,
          replyTo: message.replyTo
            ? {
                id: message.replyTo.id.toString(),
                sender: message.replyTo.sender,
                text: message.replyTo.text,
                fileUrl: message.replyTo.fileUrl,
                fileType: message.replyTo.fileType,
                fileName: message.replyTo.fileName,
              }
            : undefined,
        };

        if (updatedMessageData.chatType === 'room' && updatedMessageData.room) {
          io.to(updatedMessageData.room).emit('messageEdited', updatedMessageData);
        } else if (updatedMessageData.chatType === 'private') {
          const privateRoomId = getPrivateRoomId(
            updatedMessageData.senderId || '',
            updatedMessageData.receiverId || ''
          );
          io.to(privateRoomId).emit('messageEdited', updatedMessageData);
        }
      } catch (error: any) {
        socket.emit('messageError', 'Failed to edit message.');
      }
    }
  );

  socket.on(
    'deleteMessage',
    async ({ messageId, userId }: DeleteMessageArgs) => {
      try {
        const message = await Message.findById(messageId);

        if (!message) {
          socket.emit('messageError', 'Message not found.');
          return;
        }

        if (message.sender.toString() !== userId) {
          socket.emit('messageError', 'Not authorized to delete this message.');
          return;
        }

        const chatType = message.chatType;
        const room = message.room;
        const senderId = message.sender.toString();
        const receiverId = message.receiver?.toString();

        await message.deleteOne();

        if (chatType === 'room' && room) {
          io.to(room).emit('messageDeleted', { messageId });
        } else if (chatType === 'private' && receiverId) {
          const privateRoomId = getPrivateRoomId(senderId, receiverId);
          io.to(privateRoomId).emit('messageDeleted', { messageId });
        }
      } catch (error: any) {
        socket.emit('messageError', 'Failed to delete message.');
      }
    }
  );

  socket.on(
    'typing',
    ({ room, firstName, lastName, senderId, receiverId }: TypingArgs) => {
      const fullName = `${firstName} ${lastName}`;
      if (room) {
        if (!typingUsers.has(room)) {
          typingUsers.set(room, new Set());
        }
        typingUsers.get(room)!.add(fullName);
        socket.to(room).emit('userTyping', { username: fullName, room });
      } else if (senderId && receiverId) {
        const privateRoomId = getPrivateRoomId(senderId, receiverId);
        if (!typingUsers.has(privateRoomId)) {
          typingUsers.set(privateRoomId, new Set());
        }
        typingUsers.get(privateRoomId)!.add(fullName);
        socket.to(privateRoomId).emit('userTyping', {
          username: fullName,
          senderId,
          receiverId,
        });
      }
    }
  );

  socket.on(
    'stopTyping',
    ({ room, firstName, lastName, senderId, receiverId }: TypingArgs) => {
      const fullName = `${firstName} ${lastName}`;
      if (room) {
        if (typingUsers.has(room)) {
          typingUsers.get(room)!.delete(fullName);
          socket.to(room).emit('userStoppedTyping', { username: fullName, room });
        }
      } else if (senderId && receiverId) {
        const privateRoomId = getPrivateRoomId(senderId, receiverId);
        if (typingUsers.has(privateRoomId)) {
          typingUsers.get(privateRoomId)!.delete(fullName);
          socket.to(privateRoomId).emit('userStoppedTyping', {
            username: fullName,
            senderId,
            receiverId,
          });
        }
      }
    }
  );

  socket.on('disconnect', () => {
    if (users.has(socket.id)) {
      const { firstName, lastName, currentRoom, userId } = users.get(socket.id)!;
      const fullName = `${firstName} ${lastName}`;
      users.delete(socket.id);

      if (currentRoom) {
        const roomUsers = usersInPublicRooms.get(currentRoom);
        if (roomUsers) {
          roomUsers.delete(fullName);
          io.to(currentRoom).emit('userLeft', {
            username: fullName,
            room: currentRoom,
          });
        }
        if (typingUsers.has(currentRoom)) {
          typingUsers.get(currentRoom)!.delete(fullName);
          io.to(currentRoom).emit('userStoppedTyping', {
            username: fullName,
            room: currentRoom,
          });
        }
      }
    }

    if (socket.userId && userSockets.has(socket.userId)) {
      userSockets.get(socket.userId)!.delete(socket.id);
      if (userSockets.get(socket.userId)!.size === 0) {
        userSockets.delete(socket.userId);
        if (socket.userId) {
          globalOnlineUsers.delete(socket.userId);
          io.emit('onlineUsers', Array.from(globalOnlineUsers.values()));
        }
      }
      socket.activeRooms.forEach(room => {
        socket.leave(room);
        if (usersInPublicRooms.has(room)) {
          usersInPublicRooms.get(room)!.delete(`${socket.firstName} ${socket.lastName}`);
        }
        if (usersInPrivateRooms.has(room)) {
          usersInPrivateRooms.get(room)!.delete(socket.userId!);
        }
        if (typingUsers.has(room)) {
          typingUsers.get(room)!.delete(`${socket.firstName} ${socket.lastName}`);
          io.to(room).emit('userStoppedTyping', {
            username: `${socket.firstName} ${socket.lastName}`,
            room,
          });
        }
      });
    }
  });
});

connect(MONGODB_URI)
  .then(() => {
    httpServer.listen(PORT, () => {});
  })
  .catch((err) => {
    process.exit(1);
  });

app.get('/', (req, res) => {
  res.send(`Socket.IO server is running on port ${PORT}`);
});

process.on('unhandledRejection', (reason, promise) => {});

process.on('uncaughtException', (error: Error) => {
  process.exit(1);
});