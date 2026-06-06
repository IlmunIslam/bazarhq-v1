import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadResult {
  url: string;
  cloudinaryId: string;
}

export function uploadStream(
  buffer: Buffer,
  folder: string,
  options: Record<string, unknown> = {}
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder, resource_type: 'image', ...options },
        (err, result: UploadApiResponse | undefined) => {
          if (err || !result) return reject(err ?? new Error('Upload failed'));
          resolve({ url: result.secure_url, cloudinaryId: result.public_id });
        }
      )
      .end(buffer);
  });
}

export async function deleteImage(cloudinaryId: string): Promise<void> {
  await cloudinary.uploader.destroy(cloudinaryId);
}
