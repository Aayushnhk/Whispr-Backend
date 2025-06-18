export interface Message {
  id: string;
  _id?: string;
  senderId: string;
  sender: string;
  senderFirstName?: string;
  senderLastName?: string;
  senderProfilePicture?: string;
  text?: string;
  timestamp: string;
  room?: string;
  chatType: "room" | "private";
  receiverId?: string;
  receiver?: string;
  receiverFirstName?: string;
  receiverLastName?: string;
  isEdited?: boolean;
  fileUrl?: string;
  fileType?: "image" | "video" | "audio" | "document" | "other";
  fileName?: string;
  replyTo?: {
    id: string;
    sender: string;
    text?: string;
    fileUrl?: string;
    fileType?: "image" | "video" | "audio" | "document" | "other";
    fileName?: string;
  };
  isProfilePictureUpload?: boolean;
}

export interface ContextMenu {
  visible: boolean;
  messageId: string | null;
  position: { x: number; y: number };
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  username?: string;
  profilePicture?: string;
  role?: "user" | "admin";
  banned?: boolean;
}

export interface OnlineUser {
  userId: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  profilePicture?: string;
}
