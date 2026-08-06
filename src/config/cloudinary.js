import { v2 as cloudinary } from 'cloudinary';
// @ts-ignore
import pkg from 'multer-storage-cloudinary';
const CloudinaryStorage = pkg.CloudinaryStorage || pkg.default || pkg;
import multer from 'multer';
import crypto from 'crypto';

// Check if Cloudinary is configured
const isCloudinaryConfigured = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  console.log("Cloudinary config check:");
  console.log("  CLOUDINARY_CLOUD_NAME:", cloudName ? "present" : "missing");
  console.log("  CLOUDINARY_API_KEY:", apiKey ? "present" : "missing");
  console.log("  CLOUDINARY_API_SECRET:", apiSecret ? "present" : "missing");

  return cloudName && apiKey && apiSecret;
};

// Configure Cloudinary only if credentials are available
if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log("Cloudinary configured successfully");
} else {
  console.warn("Cloudinary is NOT configured. Avatar upload will not work.");
}

// Create upload storage for avatars using memory storage (upload handled in controller)
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'chequemart/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face' }],
    public_id: (req, file) => {
      const userId = req.user?._id;
      return `avatar-${userId}`;
    },
  },
});

// Export multer with cloudinary storage
export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
    }
  },
});

// Helper function to upload buffer to cloudinary
export const uploadBufferToCloudinary = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'chequemart/avatars',
        transformation: [
          { width: 500, height: 500, crop: 'fill', gravity: 'face' },
          ...(options.transformation || [])
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
};

export { isCloudinaryConfigured };
export default cloudinary;
