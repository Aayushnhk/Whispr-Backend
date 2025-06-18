// models/Room.ts
import mongoose, { Document, Schema, Model } from "mongoose";
import { IUser } from "./User";

export interface IRoom extends Document {
  _id: string;
  name: string;
  description: string | null;
  roomPicture: string | null;
  createdAt: Date;
  creator:
    | mongoose.Types.ObjectId
    | Pick<IUser, "_id" | "firstName" | "lastName" | "profilePicture">;
  moderators: mongoose.Types.ObjectId[];
}

const RoomSchema: Schema<IRoom> = new Schema(
  {
    name: {
      type: String,
      required: [true, "Room name is required"],
      unique: true,
      trim: true,
      minlength: [2, "Room name must be at least 2 characters long"],
      maxlength: [50, "Room name cannot exceed 50 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Room description cannot exceed 200 characters"],
      default: null,
    },
    roomPicture: {
      type: String,
      default: "/default-room-avatar.png",
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    moderators: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Room: Model<IRoom> =
  mongoose.models.Room || mongoose.model<IRoom>("Room", RoomSchema);

export default Room;