import cloudinary, { uploadBufferToCloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";
import crypto from "crypto";
import { fileTypeFromBuffer } from 'file-type';
import path from 'path';

/**
 * POST /api/upload/product-image
 * Uploads a single product image to Cloudinary.
 * Protected route for sellers/admins.
 */
export const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided.",
      });
    }

    // Magic byte validation
    const type = await fileTypeFromBuffer(req.file.buffer);
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!type || !allowedMimes.includes(type.mime)) {
      return res.status(400).json({ success: false, message: 'Invalid file content. Only JPEG, PNG, WebP, and GIF files are allowed.' });
    }

    // Sanitize filename
    const safeFilename = crypto.randomBytes(16).toString('hex') + path.extname(req.file.originalname).toLowerCase();

    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Image upload service is not configured.",
      });
    }

    // Generate a unique filename
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const filename = `product-${req.user._id}-${uniqueId}`;

    // Upload to Cloudinary (in a products folder)
    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "chequemart/products",
      public_id: filename,
      transformation: [
        { width: 1000, height: 1000, crop: "limit" }, // Keep original aspect but limit size
        { quality: "auto", fetch_format: "auto" }
      ],
    });

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      url: result.secure_url,
    });
  } catch (error) {
    console.error("Product image upload error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload image. Please try again.",
      error: error.message,
    });
  }
};
