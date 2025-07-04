import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer, Socket } from "socket.io";
import { connect } from "mongoose";
import Message, { IMessage } from "./models/Message";
import User, { IUser } from "./models/User";

declare module "socket.io" {
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
  senderProfilePicture?: string;
  receiverId: string;
  receiverFirstName: string;
  receiverLastName: string;
  text?: string;
  fileUrl?: string;
  fileType?: IMessage["fileType"];
  fileName?: string;
  replyTo?: {
    id: string;
    sender: string;
    text?: string;
    fileUrl?: string;
    fileType?: IMessage["fileType"];
    fileName?: string;
  };
}

interface SendMessageArgs {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  text?: string;
  room: string;
  fileUrl?: string;
  fileType?: IMessage["fileType"];
  fileName?: string;
  replyTo?: {
    id: string;
    sender: string;
    text?: string;
    fileUrl?: string;
    fileType?: IMessage["fileType"];
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

interface OnlineUser {
  userId: string;
  fullName: string;
  profilePicture: string;
}

interface UserSocketData {
  userId: string;
  firstName: string;
  lastName: string;
  currentRoom: string | null;
}

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = process.env.PORT || 10000;

const allowedOrigins = [
  "https://whispr-o7.vercel.app",
  "https://whispr-backend-sarl.onrender.com",
  "http://localhost:3000",
  "http://localhost:4000",
];

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    },
    transports: ["websocket", "polling"],
  });
  const users = new Map<string, UserSocketData>();
  const usersInPublicRooms = new Map<string, Set<string>>();
  const usersInPrivateRooms = new Map<string, Set<string>>();
  const userSockets = new Map<string, Set<string>>();
  const typingUsers = new Map<string, Set<string>>();
  const globalOnlineUsers = new Map<string, OnlineUser>();

  const getPrivateRoomId = (userId1: string, userId2: string): string => {
    const sortedIds = [userId1, userId2].sort();
    return `private_${sortedIds[0]}_${sortedIds[1]}`;
  };

  io.on("connection", (socket: Socket) => {
    console.log(`New connection: ${socket.id}`);
    socket.activeRooms = new Set();

    socket.on(
      "registerUser",
      async (
        userId: string,
        firstName: string,
        lastName: string,
        profilePicture?: string
      ) => {
        if (!userId || userId === "undefined" || !firstName || !lastName) {
          socket.emit(
            "error",
            "Invalid registration data: userId, firstName, and lastName are required"
          );
          return;
        }

        try {
          const userDoc = (await User.findById(userId)) as IUser | null;
          if (!userDoc) {
            socket.emit("error", "User not found");
            return;
          }
          if (userDoc.banned) {
            socket.emit("error", "User is banned");
            return;
          }
          if (!userDoc.profilePicture) {
            userDoc.profilePicture = "/default-avatar.png";
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
          const profilePictureValue = profilePicture || userDoc.profilePicture;

          if (!globalOnlineUsers.has(userId)) {
            globalOnlineUsers.set(userId, {
              userId,
              fullName,
              profilePicture: profilePictureValue,
            });
            await User.findByIdAndUpdate(userId, { isOnline: true });
            io.emit("onlineUsers", Array.from(globalOnlineUsers.values()));
          }
          socket.emit("onlineUsers", Array.from(globalOnlineUsers.values()));
        } catch (error) {
          console.error("Error registering user:", error);
          socket.emit("error", "Failed to verify user");
        }
      }
    );

    socket.on(
      "joinRoom",
      async (
        room: string,
        userId: string,
        firstName: string,
        lastName: string
      ) => {
        if (
          !room ||
          !userId ||
          userId === "undefined" ||
          !firstName ||
          !lastName
        ) {
          socket.emit(
            "error",
            "Invalid join data: room, userId, firstName, and lastName are required"
          );
          return;
        }

        try {
          const userDoc = (await User.findById(userId)) as IUser | null;
          if (!userDoc || userDoc.banned) {
            socket.emit("error", userDoc ? "User is banned" : "User not found");
            return;
          }
          if (!userDoc.profilePicture) {
            userDoc.profilePicture = "/default-avatar.png";
            await userDoc.save();
          }
        } catch (error) {
          console.error("Error joining room:", error);
          socket.emit("error", "Failed to verify user");
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
            io.to(previousPublicRoom).emit("userLeft", {
              username: fullName,
              room: previousPublicRoom,
            });
          }
          if (typingUsers.has(previousPublicRoom)) {
            const fullName = `${socket.firstName} ${socket.lastName}`;
            typingUsers.get(previousPublicRoom)!.delete(fullName);
            io.to(previousPublicRoom).emit("userStoppedTyping", {
              username: fullName,
              room: previousPublicRoom,
            });
          }
        }

        socket.join(room);
        socket.activeRooms.add(room);
        const fullName = `${firstName} ${lastName}`;
        users.set(socket.id, {
          userId,
          firstName,
          lastName,
          currentRoom: room,
        });

        if (!usersInPublicRooms.has(room)) {
          usersInPublicRooms.set(room, new Set());
        }
        usersInPublicRooms.get(room)!.add(fullName);

        io.to(room).emit("userJoined", {
          username: fullName,
          room,
        });

        if (!globalOnlineUsers.has(userId)) {
          const userDoc = (await User.findById(userId)) as IUser | null;
          const profilePicture =
            userDoc?.profilePicture || "/default-avatar.png";
          globalOnlineUsers.set(userId, { userId, fullName, profilePicture });
          await User.findByIdAndUpdate(userId, { isOnline: true });
          io.emit("onlineUsers", Array.from(globalOnlineUsers.values()));
        }
        socket.emit("onlineUsers", Array.from(globalOnlineUsers.values()));
      }
    );

    socket.on(
      "joinPrivateRoom",
      async (
        {
          senderId,
          senderFirstName,
          senderLastName,
          receiverId,
          receiverFirstName,
          receiverLastName,
        }: JoinPrivateRoomArgs,
        callback: (response: {
          success: boolean;
          message?: string;
          room?: string;
          userId?: string;
          error?: string;
        }) => void
      ) => {
        if (!senderId || !receiverId || !senderFirstName || !senderLastName) {
          callback({ success: false, error: "Invalid private room data" });
          return;
        }

        try {
          const sender = (await User.findById(senderId)) as IUser | null;
          const receiver = (await User.findById(receiverId)) as IUser | null;
          if (!sender || !receiver) {
            callback({ success: false, error: "User not found" });
            return;
          }
          if (sender.banned || receiver.banned) {
            callback({ success: false, error: "One or both users are banned" });
            return;
          }
          if (!sender.profilePicture) {
            sender.profilePicture = "/default-avatar.png";
            await sender.save();
          }
          if (!receiver.profilePicture) {
            receiver.profilePicture = "/default-avatar.png";
            await receiver.save();
          }
        } catch (error) {
          console.error("Error joining private room:", error);
          callback({ success: false, error: "Failed to validate users" });
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

        const fetchReceiverDetails = async (): Promise<{
          firstName: string;
          lastName: string;
        }> => {
          try {
            const receiverUser = (await User.findById(
              receiverId
            )) as IUser | null;
            if (receiverUser) {
              return {
                firstName: receiverUser.firstName || "Unknown",
                lastName: receiverUser.lastName || "",
              };
            }
            return { firstName: "Unknown", lastName: "" };
          } catch (error) {
            console.error("Error fetching receiver details:", error);
            return { firstName: "Unknown", lastName: "" };
          }
        };

        const receiverDetails = await fetchReceiverDetails();
        const updatedFirstName = receiverFirstName || receiverDetails.firstName;
        const updatedLastName = receiverLastName || receiverDetails.lastName;

        const receiverFullName = `${updatedFirstName} ${updatedLastName}`;
        const receiverSockets = userSockets.get(receiverId);
        if (receiverSockets) {
          for (const receiverSocketId of receiverSockets) {
            const receiverSocket = io.sockets.sockets.get(receiverSocketId);
            if (
              receiverSocket &&
              !receiverSocket.activeRooms.has(privateRoomId)
            ) {
              receiverSocket.join(privateRoomId);
              receiverSocket.activeRooms.add(privateRoomId);
              if (!usersInPrivateRooms.has(privateRoomId)) {
                usersInPrivateRooms.set(privateRoomId, new Set());
              }
              usersInPrivateRooms.get(privateRoomId)!.add(receiverId);
            }
          }
        }

        callback({
          success: true,
          message: "Joined private room",
          room: privateRoomId,
          userId: senderId,
        });
      }
    );

    socket.on(
      "leavePrivateRoom",
      ({ senderId, receiverId }: { senderId: string; receiverId: string }) => {
        if (!senderId || !receiverId) {
          socket.emit("error", "Invalid leave data");
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
      "sendMessage",
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
          socket.emit("messageError", "Message cannot be empty.");
          return;
        }

        try {
          const userDoc = (await User.findById(userId)) as IUser | null;
          if (!userDoc || userDoc.banned) {
            socket.emit("error", userDoc ? "User is banned" : "User not found");
            return;
          }
        } catch (error) {
          console.error("Error sending message:", error);
          socket.emit("error", "Failed to verify user");
          return;
        }

        const fullName = `${firstName} ${lastName}`;
        try {
          let replyToData: IMessage["replyTo"] | undefined;
          if (replyTo?.id) {
            const repliedMessage = (await Message.findById(
              replyTo.id
            )) as IMessage | null;
            if (!repliedMessage) {
              socket.emit("messageError", "Replied message not found.");
              return;
            }
            replyToData = {
              id: repliedMessage._id,
              sender:
                replyTo.sender ||
                `${repliedMessage.firstName} ${repliedMessage.lastName}`,
              text: replyTo.text || repliedMessage.text,
              fileUrl: replyTo.fileUrl || repliedMessage.fileUrl,
              fileType: replyTo.fileType || repliedMessage.fileType,
              fileName: replyTo.fileName || repliedMessage.fileName,
            };
          }

          const senderUser = (await User.findById(userId)
            .select("profilePicture")
            .lean()) as IUser | null;
          const senderProfilePicture =
            senderUser?.profilePicture || "/default-avatar.png";

          const newMessage = new Message({
            sender: userId,
            firstName,
            lastName,
            senderProfilePicture: senderProfilePicture,
            room,
            text: text || undefined,
            chatType: "room",
            fileUrl: fileUrl || undefined,
            fileType: fileType || undefined,
            fileName: fileName || undefined,
            replyTo: replyToData || undefined,
          });
          await newMessage.save();

          if (typingUsers.has(room)) {
            typingUsers.get(room)!.delete(fullName);
            io.to(room).emit("userStoppedTyping", { username: fullName, room });
          }

          io.to(room).emit("receiveMessage", {
            _id: newMessage._id.toString(),
            id,
            sender: fullName,
            senderId: userId,
            senderProfilePicture: newMessage.senderProfilePicture,
            text: newMessage.text,
            timestamp: newMessage.createdAt.toISOString(),
            room: newMessage.room,
            chatType: newMessage.chatType,
            isEdited: newMessage.isEdited || false,
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
          });
        } catch (error) {
          console.error("Error saving message:", error);
          socket.emit("messageError", "Failed to send message.");
        }
      }
    );

    socket.on(
      "privateMessage",
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
        callback: (response: {
          success: boolean;
          messageId?: string;
          error?: string;
        }) => void
      ) => {
        if (!text && !fileUrl) {
          callback({
            success: false,
            error: "Private message cannot be empty.",
          });
          return;
        }

        if (!senderId || !receiverId || !senderFirstName || !senderLastName) {
          callback({ success: false, error: "Invalid message data." });
          return;
        }

        try {
          const sender = (await User.findById(senderId)) as IUser | null;
          const receiver = (await User.findById(receiverId)) as IUser | null;
          if (!sender || !receiver) {
            callback({ success: false, error: "User not found" });
            return;
          }
          if (sender.banned || receiver.banned) {
            callback({ success: false, error: "One or both users are banned" });
            return;
          }
        } catch (error) {
          console.error("Error verifying users for private message:", error);
          callback({ success: false, error: "Failed to verify users" });
          return;
        }

        const senderFullName = `${senderFirstName} ${senderLastName}`;
        const privateRoomId = getPrivateRoomId(senderId, receiverId);

        const fetchReceiverDetails = async (): Promise<{
          firstName: string;
          lastName: string;
        }> => {
          try {
            const receiverUser = (await User.findById(
              receiverId
            )) as IUser | null;
            if (receiverUser) {
              return {
                firstName: receiverUser.firstName,
                lastName: receiverUser.lastName,
              };
            }
            return { firstName: "Unknown", lastName: "" };
          } catch (error) {
            console.error("Error fetching receiver details:", error);
            return { firstName: "Unknown", lastName: "" };
          }
        };

        try {
          const receiverDetails = await fetchReceiverDetails();
          const updatedFirstName =
            receiverFirstName || receiverDetails.firstName;
          const updatedLastName = receiverLastName || receiverDetails.lastName;

          const receiverFullName = `${updatedFirstName} ${updatedLastName}`;

          let replyToData: IMessage["replyTo"] | undefined;
          if (replyTo?.id) {
            const repliedMessage = (await Message.findById(
              replyTo.id
            )) as IMessage | null;
            if (!repliedMessage) {
              callback({ success: false, error: "Replied message not found." });
              return;
            }
            replyToData = {
              id: repliedMessage._id,
              sender:
                replyTo.sender ||
                `${repliedMessage.firstName} ${repliedMessage.lastName}`,
              text: replyTo.text || repliedMessage.text,
              fileUrl: replyTo.fileUrl || repliedMessage.fileUrl,
              fileType: replyTo.fileType || repliedMessage.fileType,
              fileName: replyTo.fileName || repliedMessage.fileName,
            };
          }

          const senderUser = (await User.findById(senderId)
            .select("profilePicture")
            .lean()) as IUser | null;
          const senderProfilePicture =
            senderUser?.profilePicture || "/default-avatar.png";

          const newMessage = new Message({
            sender: senderId,
            firstName: senderFirstName,
            lastName: senderLastName,
            senderProfilePicture: senderProfilePicture,
            receiver: receiverId,
            receiverFirstName: updatedFirstName,
            receiverLastName: updatedLastName,
            text: text || undefined,
            chatType: "private",
            fileUrl: fileUrl || undefined,
            fileType: fileType || undefined,
            fileName: fileName || undefined,
            replyTo: replyToData || undefined,
          });
          await newMessage.save();

          const messageToSend = {
            _id: newMessage._id.toString(),
            id,
            senderId,
            senderUsername: senderFullName,
            senderProfilePicture: newMessage.senderProfilePicture,
            text: newMessage.text,
            timestamp: newMessage.createdAt.toISOString(),
            chatType: newMessage.chatType,
            receiverId,
            receiverUsername: receiverFullName,
            receiverFirstName: newMessage.receiverFirstName,
            receiverLastName: newMessage.receiverLastName,
            isEdited: newMessage.isEdited || false,
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

          socket.emit("receivePrivateMessage", messageToSend);
          if (usersInPrivateRooms.has(privateRoomId)) {
            io.to(privateRoomId).emit("receivePrivateMessage", messageToSend);
          }

          if (userSockets.has(receiverId)) {
            const receiverSocketIds = userSockets.get(receiverId)!;
            const notificationContent =
              text || `[File: ${fileName || "Shared File"}]`;
            for (const receiverSocketId of receiverSocketIds) {
              const receiverSocket = io.sockets.sockets.get(receiverSocketId);
              if (receiverSocket && !receiverSocket.rooms.has(privateRoomId)) {
                receiverSocket.emit("privateMessageNotification", {
                  senderId,
                  senderUsername: senderFullName,
                  messageSnippet:
                    notificationContent.length > 100
                      ? notificationContent.substring(0, 97) + "..."
                      : notificationContent,
                  fullMessageId: messageToSend._id,
                  chatType: "private",
                  timestamp: messageToSend.timestamp,
                  fileUrl: messageToSend.fileUrl,
                  fileType: messageToSend.fileType,
                  fileName: messageToSend.fileName,
                });
              }
            }
          }

          callback({ success: true, messageId: newMessage._id.toString() });
        } catch (error) {
          console.error("Error sending private message:", error);
          callback({
            success: false,
            error: "Failed to send private message.",
          });
        }
      }
    );

    socket.on(
      "getPrivateMessages",
      async ({ user1Id, user2Id }: GetPrivateMessagesArgs) => {
        if (!user1Id || !user2Id) {
          socket.emit("messageError", "Invalid user IDs");
          return;
        }

        try {
          const messages = (await Message.find({
            $or: [
              { sender: user1Id, receiver: user2Id, chatType: "private" },
              { sender: user2Id, receiver: user1Id, chatType: "private" },
            ],
          }).lean()) as IMessage[];

          const uniqueSenderIds = new Set(
            messages.map((m) => m.sender.toString())
          );
          const senders = await User.find({
            _id: { $in: Array.from(uniqueSenderIds) },
          })
            .select("profilePicture")
            .lean();
          const senderProfileMap = new Map(
            senders.map((u) => [
              u._id.toString(),
              u.profilePicture || "/default-avatar.png",
            ])
          );

          const formattedMessages = messages.map((m) => ({
            _id: m._id.toString(),
            id: m._id.toString(),
            senderId: m.sender.toString(),
            senderUsername: `${m.firstName} ${m.lastName}`,
            senderProfilePicture: senderProfileMap.get(m.sender.toString()),
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
            fileUrl: m.fileUrl,
            fileType: m.fileType,
            fileName: m.fileName,
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
          socket.emit("historicalPrivateMessages", formattedMessages);
        } catch (error) {
          console.error("Error fetching private messages:", error);
          socket.emit("messageError", "Failed to fetch private messages.");
        }
      }
    );

    socket.on(
      "editMessage",
      async ({ messageId, newText, userId }: EditMessageArgs) => {
        try {
          const message = (await Message.findById(
            messageId
          )) as IMessage | null;

          if (!message) {
            socket.emit("messageError", "Message not found.");
            return;
          }

          if (message.sender.toString() !== userId) {
            socket.emit("messageError", "Not authorized to edit this message.");
            return;
          }

          if (message.fileUrl && (!newText || newText.trim() === "")) {
            socket.emit(
              "messageError",
              "Cannot edit a message that is solely a file."
            );
            return;
          }

          message.text = newText;
          message.isEdited = true;
          await message.save();

          const fullSenderName = `${message.firstName} ${message.lastName}`;
          const fullReceiverName =
            message.receiverFirstName && message.receiverLastName
              ? `${message.receiverFirstName} ${message.receiverLastName}`
              : undefined;

          const senderProfilePicture = message.senderProfilePicture;

          const updatedMessageData = {
            _id: message._id.toString(),
            id: message._id.toString(),
            senderId: message.sender.toString(),
            senderUsername: fullSenderName,
            senderProfilePicture: senderProfilePicture,
            text: message.text,
            timestamp: message.createdAt.toISOString(),
            isEdited: true,
            chatType: message.chatType,
            room: message.room,
            receiverId: message.receiver?.toString(),
            receiverUsername: fullReceiverName,
            receiverFirstName: message.receiverFirstName,
            receiverLastName: message.receiverLastName,
            fileUrl: message.fileUrl,
            fileType: message.fileType,
            fileName: message.fileName,
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

          if (
            updatedMessageData.chatType === "room" &&
            updatedMessageData.room
          ) {
            io.to(updatedMessageData.room).emit(
              "messageEdited",
              updatedMessageData
            );
          } else if (updatedMessageData.chatType === "private") {
            const privateRoomId = getPrivateRoomId(
              updatedMessageData.senderId || "",
              updatedMessageData.receiverId || ""
            );
            io.to(privateRoomId).emit("messageEdited", updatedMessageData);
          }
        } catch (error) {
          console.error("Error editing message:", error);
          socket.emit("messageError", "Failed to edit message.");
        }
      }
    );

    socket.on(
      "deleteMessage",
      async ({ messageId, userId }: DeleteMessageArgs) => {
        try {
          const message = (await Message.findById(
            messageId
          )) as IMessage | null;

          if (!message) {
            socket.emit("messageError", "Message not found.");
            return;
          }

          if (message.sender.toString() !== userId) {
            socket.emit(
              "messageError",
              "Not authorized to delete this message."
            );
            return;
          }

          const chatType = message.chatType;
          const room = message.room;
          const senderId = message.sender.toString();
          const receiverId = message.receiver?.toString();

          await message.deleteOne();

          if (chatType === "room" && room) {
            io.to(room).emit("messageDeleted", { messageId });
          } else if (chatType === "private" && receiverId) {
            const privateRoomId = getPrivateRoomId(senderId, receiverId);
            io.to(privateRoomId).emit("messageDeleted", { messageId });
          }
        } catch (error) {
          console.error("Error deleting message:", error);
          socket.emit("messageError", "Failed to delete message.");
        }
      }
    );

    socket.on(
      "typing",
      ({ room, firstName, lastName, senderId, receiverId }: TypingArgs) => {
        const fullName = `${firstName} ${lastName}`;
        if (room) {
          if (!typingUsers.has(room)) {
            typingUsers.set(room, new Set());
          }
          typingUsers.get(room)!.add(fullName);
          io.to(room).emit("userTyping", { username: fullName, room });
        } else if (senderId && receiverId) {
          const privateRoomId = getPrivateRoomId(senderId, receiverId);
          if (!typingUsers.has(privateRoomId)) {
            typingUsers.set(privateRoomId, new Set());
          }
          typingUsers.get(privateRoomId)!.add(fullName);
          io.to(privateRoomId).emit("userTyping", {
            username: fullName,
            senderId,
            receiverId,
          });
        }
      }
    );

    socket.on(
      "stopTyping",
      ({ room, firstName, lastName, senderId, receiverId }: TypingArgs) => {
        const fullName = `${firstName} ${lastName}`;
        if (room) {
          if (typingUsers.has(room)) {
            typingUsers.get(room)!.delete(fullName);
            io.to(room).emit("userStoppedTyping", { username: fullName, room });
          }
        } else if (senderId && receiverId) {
          const privateRoomId = getPrivateRoomId(senderId, receiverId);
          if (typingUsers.has(privateRoomId)) {
            typingUsers.get(privateRoomId)!.delete(fullName);
            io.to(privateRoomId).emit("userStoppedTyping", {
              username: fullName,
              senderId,
              receiverId,
            });
          }
        }
      }
    );

    socket.on("disconnect", async () => {
      console.log(`Disconnected: ${socket.id}`);
      if (users.has(socket.id)) {
        const { firstName, lastName, currentRoom, userId } = users.get(
          socket.id
        )!;
        const fullName = `${firstName} ${lastName}`;
        users.delete(socket.id);

        if (currentRoom) {
          const roomUsers = usersInPublicRooms.get(currentRoom);
          if (roomUsers) {
            roomUsers.delete(fullName);
            io.to(currentRoom).emit("userLeft", {
              username: fullName,
              room: currentRoom,
            });
          }
          if (typingUsers.has(currentRoom)) {
            typingUsers.get(currentRoom)!.delete(fullName);
            io.to(currentRoom).emit("userStoppedTyping", {
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
            await User.findByIdAndUpdate(socket.userId, { isOnline: false });
            io.emit("onlineUsers", Array.from(globalOnlineUsers.values()));
          }
        }
        socket.activeRooms.forEach((room) => {
          socket.leave(room);
          if (usersInPublicRooms.has(room)) {
            usersInPublicRooms
              .get(room)!
              .delete(`${socket.firstName} ${socket.lastName}`);
          }
          if (usersInPrivateRooms.has(room)) {
            usersInPrivateRooms.get(room)!.delete(socket.userId!);
          }
          if (typingUsers.has(room)) {
            typingUsers
              .get(room)!
              .delete(`${socket.firstName} ${socket.lastName}`);
            io.to(room).emit("userStoppedTyping", {
              username: `${socket.firstName} ${socket.lastName}`,
              room,
            });
          }
        });
      }
    });
  });

  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not defined");
    process.exit(1);
  }

  connect(MONGODB_URI)
    .then(() => {
      console.log("Connected to MongoDB");
      server.listen(port, () => {
        console.log(`Server running on port ${port}`);
        console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
      });
    })
    .catch((err) => {
      console.error("MongoDB connection error:", err);
      process.exit(1);
    });

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
  });

  process.on("uncaughtException", (error: Error) => {
    console.error("Uncaught Exception:", error);
    process.exit(1);
  });
});
