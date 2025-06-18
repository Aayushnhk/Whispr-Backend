import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface CloudinaryUploadResult {
  secure_url: string;
  public_id?: string;
  resource_type?: string;
  [key: string]: unknown; // Safe index signature
}

interface CloudinaryError {
  message: string;
  http_code?: number;
}

export async function uploadFileToCloudinary(
  file: File,
  folder: string,
  resourceType: 'image' | 'video' | 'raw'
): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error: CloudinaryError | undefined, result: CloudinaryUploadResult | undefined) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return reject(error);
        }
        if (!result || !result.secure_url) {
          return reject(new Error('Cloudinary upload did not return a secure_url.'));
        }
        resolve(result.secure_url);
      }
    ).end(buffer);
  });
}

export function getCloudinaryResourceType(fileType: string): 'image' | 'video' | 'raw' {
  if (fileType.startsWith('image/')) {
    return 'image';
  } else if (fileType.startsWith('video/') || fileType.startsWith('audio/')) {
    return 'video';
  }
  return 'raw';
}

export async function deleteFileFromCloudinary(fileUrl: string): Promise<void> {
  try {
    const urlParts = fileUrl.split('/');
    const versionIndex = urlParts.findIndex((part) => part.startsWith('v')) + 1;
    let publicId = urlParts.slice(versionIndex).join('/');
    publicId = publicId.substring(0, publicId.lastIndexOf('.'));

    const resourceType = getCloudinaryResourceTypeFromUrl(fileUrl);

    if (publicId) {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      console.log(`Successfully deleted ${publicId} from Cloudinary.`);
    } else {
      console.warn(`Could not extract public_id from URL for deletion: ${fileUrl}`);
    }
  } catch (error: unknown) {
    console.error('Error deleting file from Cloudinary:', error);
  }
}

function getCloudinaryResourceTypeFromUrl(fileUrl: string): 'image' | 'video' | 'raw' {
  if (fileUrl.includes('/image/upload')) return 'image';
  if (fileUrl.includes('/video/upload')) return 'video';
  if (fileUrl.includes('/raw/upload')) return 'raw';
  return 'image';
}