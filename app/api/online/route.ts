// WHISPR-BACKEND/app/api/online/route.ts
import { NextResponse } from "next/server";
import connect from "@/lib/db/connect";
import User from "@/models/User";

export async function GET() {
  try {
    await connect();
    const onlineUsers = await User.find({ isOnline: true })
      .select("_id firstName lastName profilePicture")
      .lean();

    return NextResponse.json(onlineUsers);
  } catch (error) {
    console.error("Error fetching online users:", error);
    return NextResponse.json(
      {
        message: "Failed to fetch online users",
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
