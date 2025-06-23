import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/connect";
import User from "@/models/User";
import jwt from "jsonwebtoken";
import { corsMiddleware, handleOptions } from "@/lib/cors";

interface DecodedToken {
  id: string;
}

// Helper to verify JWT token
async function verifyToken(
  req: NextRequest
): Promise<{ id: string } | { error: string; status: number }> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return { error: "No token provided", status: 401 };
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as DecodedToken;
    return { id: decoded.id };
  } catch (error) {
    console.error("Token verification failed:", error);
    return { error: "Invalid or expired token", status: 401 };
  }
}

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(_req: NextRequest) {
  await dbConnect();
  console.log("POST /api/update-profile-picture: Incoming request to update profile picture.");

  const authResult = await verifyToken(_req);
  if ("error" in authResult) {
    console.log(
      `POST /api/update-profile-picture: Authentication failed - ${authResult.error}. Returning ${authResult.status}.`
    );
    const response = NextResponse.json(
      { success: false, message: authResult.error },
      { status: authResult.status }
    );
    return corsMiddleware(_req, response);
  }

  const currentUserId = authResult.id;
  console.log(`POST /api/update-profile-picture: User ${currentUserId} is authenticated.`);

  try {
    const { userId, profilePictureUrl } = await _req.json();

    if (!userId || !profilePictureUrl) {
      console.log("POST /api/update-profile-picture: Missing userId or profilePictureUrl. Returning 400.");
      const response = NextResponse.json(
        { success: false, message: "Missing userId or profilePictureUrl." },
        { status: 400 }
      );
      return corsMiddleware(_req, response);
    }

    if (userId !== currentUserId) {
      console.log(`POST /api/update-profile-picture: Unauthorized access - tried to update ${userId} from ${currentUserId}. Returning 403.`);
      const response = NextResponse.json(
        { success: false, message: "Unauthorized: You can only update your own profile picture." },
        { status: 403 }
      );
      return corsMiddleware(_req, response);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePicture: profilePictureUrl },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      console.log(`POST /api/update-profile-picture: User ${userId} not found. Returning 404.`);
      const response = NextResponse.json(
        { success: false, message: "User not found." },
        { status: 404 }
      );
      return corsMiddleware(_req, response);
    }

    console.log(`POST /api/update-profile-picture: Profile picture updated for user ${userId}.`);
    const response = NextResponse.json(
      { success: true, message: "Profile picture updated successfully.", profilePicture: updatedUser.profilePicture },
      { status: 200 }
    );
    return corsMiddleware(_req, response);

  } catch (error: unknown) { // Change 'any' to 'unknown'
    console.error("POST /api/update-profile-picture: Server error during profile picture update:", error);
    let errorMessage = "Internal server error during profile picture update.";
    if (error instanceof Error) { // Check if it's an instance of Error
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMessage = (error as any).message; // Fallback for non-Error objects with a message
    }

    const response = NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    );
    return corsMiddleware(_req, response);
  }
}