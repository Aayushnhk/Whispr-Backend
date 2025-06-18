// src/lib/cloudinary-upload.ts
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a file to Cloudinary.
 * @param file The File object to upload (from FormData).
 * @param folder The folder in Cloudinary where the file should be stored.
 * @param resourceType The type of resource ('image', 'video', 'raw').
 * @returns The secure URL of the uploaded file.
 */
export async function uploadFileToCloudinary(
  file: File,
  folder: string,
  resourceType: "image" | "video" | "raw"
): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: folder,
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) {
            console.error("Cloudinary upload error:", error);
            return reject(error);
          }
          if (
            !result ||
            typeof result !== "object" ||
            !("secure_url" in result)
          ) {
            return reject(
              new Error("Cloudinary upload did not return a secure_url.")
            );
          }
          resolve((result as any).secure_url);
        }
      )
      .end(buffer);
  });
}

/**
 * Determines the Cloudinary resource type based on file MIME type.
 * @param fileType The MIME type of the file (e.g., 'image/jpeg', 'video/mp4').
 * @returns 'image', 'video', or 'raw'.
 */
export function getCloudinaryResourceType(
  fileType: string
): "image" | "video" | "raw" {
  if (fileType.startsWith("image/")) {
    return "image";
  } else if (fileType.startsWith("video/") || fileType.startsWith("audio/")) {
    return "video";
  } else {
    return "raw";
  }
}

/**
 * Deletes a file from Cloudinary based on its URL.
 * @param fileUrl The secure URL of the file to delete.
 */
export async function deleteFileFromCloudinary(fileUrl: string): Promise<void> {
  try {
    const urlParts = fileUrl.split("/");
    const versionIndex = urlParts.findIndex((part) => part.startsWith("v")) + 1;
    let publicId = urlParts.slice(versionIndex).join("/");
    // Remove file extension (e.g., .png, .jpg)
    publicId = publicId.substring(0, publicId.lastIndexOf("."));

    // Determine resource type for deletion
    const resourceType = getCloudinaryResourceTypeFromUrl(fileUrl);

    if (publicId) {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      console.log(`Successfully deleted ${publicId} from Cloudinary.`);
    } else {
      console.warn(
        `Could not extract public_id from URL for deletion: ${fileUrl}`
      );
    }
  } catch (error) {
    console.error("Error deleting file from Cloudinary:", error);
  }
}

// Helper for deletion based on URL type
function getCloudinaryResourceTypeFromUrl(
  fileUrl: string
): "image" | "video" | "raw" {
  if (fileUrl.includes("/image/upload")) return "image";
  if (fileUrl.includes("/video/upload")) return "video";
  if (fileUrl.includes("/raw/upload")) return "raw";
  return "image";
}
