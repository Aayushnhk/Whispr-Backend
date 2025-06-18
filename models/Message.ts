import mongoose, { Document, Schema, Model } from "mongoose";

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  room?: string;
  receiver?: mongoose.Types.ObjectId;
  receiverFirstName?: string;
  receiverLastName?: string;
  text?: string;
  chatType: "room" | "private";
  isEdited: boolean;
  fileUrl?: string;
  fileType?: "image" | "video" | "audio" | "document" | "other";
  fileName?: string;
  createdAt: Date;
  replyTo?: {
    id: mongoose.Types.ObjectId;
    sender: string;
    text?: string;
    fileUrl?: string;
    fileType?: "image" | "video" | "audio" | "document" | "other";
    fileName?: string;
  };
  isProfilePictureUpload?: boolean;
  read: boolean;
}

const MessageSchema: Schema<IMessage> = new Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: [1, "Sender first name cannot be empty"],
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: [1, "Sender last name cannot be empty"],
    },
    room: {
      type: String,
      required: function (this: IMessage) {
        return this.chatType === "room";
      },
      trim: true,
      minlength: [1, "Room name cannot be empty"],
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function (this: IMessage) {
        return this.chatType === "private" && !this.isProfilePictureUpload;
      },
    },
    receiverFirstName: {
      type: String,
      required: function (this: IMessage) {
        return this.chatType === "private" && !this.isProfilePictureUpload;
      },
      trim: true,
      minlength: [1, "Receiver first name cannot be empty"],
    },
    receiverLastName: {
      type: String,
      required: function (this: IMessage) {
        return this.chatType === "private" && !this.isProfilePictureUpload;
      },
      trim: true,
      minlength: [1, "Receiver last name cannot be empty"],
    },
    text: {
      type: String,
      trim: true,
      validate: {
        validator: function (this: IMessage, value: string | undefined) {
          return !value || value.length > 0;
        },
        message: "Text cannot be an empty string",
      },
    },
    chatType: {
      type: String,
      enum: ["room", "private"],
      required: true,
      default: "room",
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    fileUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (this: IMessage, value: string | undefined) {
          return !value || value.length > 0;
        },
        message: "File URL cannot be an empty string",
      },
    },
    fileType: {
      type: String,
      enum: ["image", "video", "audio", "document", "other"],
      trim: true,
    },
    fileName: {
      type: String,
      trim: true,
    },
    replyTo: {
      type: {
        id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Message",
          required: true,
        },
        sender: {
          type: String,
          required: true,
          trim: true,
          minlength: [1, "Replied message sender cannot be empty"],
        },
        text: {
          type: String,
          trim: true,
        },
        fileUrl: {
          type: String,
          trim: true,
        },
        fileType: {
          type: String,
          enum: ["image", "video", "audio", "document", "other"],
          trim: true,
        },
        fileName: {
          type: String,
          trim: true,
        },
      },
      required: false,
      validate: {
        validator: async function (this: IMessage, value: any) {
          if (!value) return true;
          const message = await mongoose.model("Message").findById(value.id);
          return !!message;
        },
        message: "Replied message does not exist",
      },
    },
    isProfilePictureUpload: {
      type: Boolean,
      default: false,
      required: false,
    },
    read: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        ret._id = ret._id.toString();
        ret.sender = ret.sender.toString();
        if (ret.receiver) ret.receiver = ret.receiver.toString();
        if (ret.replyTo?.id) ret.replyTo.id = ret.replyTo.id.toString();
        return ret;
      },
    },
  }
);

MessageSchema.pre("validate", function (this: IMessage, next) {
  if (this.isProfilePictureUpload) {
    if (!this.fileUrl) {
      this.invalidate(
        "fileUrl",
        "Profile picture upload must include a file URL"
      );
    }
  } else if (!this.text && !this.fileUrl) {
    this.invalidate("text", "Message must contain text or a file attachment");
    this.invalidate(
      "fileUrl",
      "Message must contain text or a file attachment"
    );
  }
  next();
});

const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>("Message", MessageSchema);

export default Message;