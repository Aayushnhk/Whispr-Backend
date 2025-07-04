// WHISPR-BACKEND/app/api/cloudinary-sign-upload/route.ts

import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { corsMiddleware, handleOptions } from "@/lib/cors";
import jwt from "jsonwebtoken";

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  throw new Error("Cloudinary environment variables not configured");
}

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

// This POST request will now generate a Cloudinary signature for direct client-side upload
export async function POST(_req: NextRequest) {
  // Corrected log message to reflect the actual endpoint path
  console.log("POST /api/cloudinary-sign-upload (Signature Endpoint): Incoming request.");

  // Authenticate the request from the client
  const authResult = await verifyToken(_req);
  if ("error" in authResult) {
    console.log(
      `POST /api/cloudinary-sign-upload (Signature Endpoint): Authentication failed - ${authResult.error}. Returning ${authResult.status}.`
    );
    const response = NextResponse.json(
      { success: false, message: authResult.error },
      { status: authResult.status }
    );
    return corsMiddleware(_req, response);
  }

  const currentUserId = authResult.id;
  console.log(
    `POST /api/cloudinary-sign-upload (Signature Endpoint): User ${currentUserId} is authenticated.`
  );

  try {
    // Expect parameters from the client needed for signature generation
    const { folder, public_id, resource_type, upload_preset } =
      await _req.json();

    if (!upload_preset) {
      console.log(
        "POST /api/cloudinary-sign-upload (Signature Endpoint): Missing upload_preset. Returning 400."
      );
      const response = NextResponse.json(
        { success: false, message: "Upload preset is required." },
        { status: 400 }
      );
      return corsMiddleware(_req, response);
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    const params: Record<string, string | number> = {
      timestamp,
      upload_preset,
      // IMPORTANT FIX: Removed 'resource_type' from params being signed.
      // Cloudinary's signature only needs upload parameters, not the resource_type used in the URL.
    };

    if (folder) {
      params.folder = folder;
    }
    // Allow the client to suggest a public_id for finer control, or let Cloudinary generate one
    if (public_id) {
      params.public_id = public_id;
    }

    // Generate the Cloudinary signature
    const signature = cloudinary.utils.api_sign_request(
      params, // This now contains only the parameters Cloudinary expects for signing
      process.env.CLOUDINARY_API_SECRET as string
    );

    // Return the necessary details for the client to perform direct upload
    const response = NextResponse.json(
      {
        success: true,
        signature,
        timestamp,
        api_key: process.env.CLOUDINARY_API_KEY,
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        upload_preset: upload_preset, // Use the upload_preset received from client, not environment variable
        folder: folder, // Echo back the requested folder
        public_id: public_id, // Echo back the requested public_id
        resource_type: resource_type, // Echo back the requested resource_type (still needed for frontend URL construction)
      },
      { status: 200 }
    );

    // Corrected log message
    console.log(
      "POST /api/cloudinary-sign-upload (Signature Endpoint): Signature generated successfully."
    );
    return corsMiddleware(_req, response);
  } catch (error) {
    let errorMessage = "Failed to generate Cloudinary signature.";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    }
    console.error(
      "POST /api/cloudinary-sign-upload (Signature Endpoint): Server error during signature generation:", // Corrected log message
      error
    );
    const response = NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    );
    return corsMiddleware(_req, response);
  }
}