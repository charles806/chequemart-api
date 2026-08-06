import { Router } from "express";
import multer from "multer";
import rateLimit from 'express-rate-limit';
import { uploadProductImage } from "../controllers/upload.controller.js";
import { protect, restrictTo } from "../middleware/auth.middleware.js";

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, and WebP are allowed."), false);
    }
  },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { success: false, message: "Upload limit reached (10 per hour). Try again later." },
});

// POST /api/upload/product-image
// Only sellers and admins can upload product images
router.post(
  "/product-image",
  protect,
  restrictTo("seller", "admin"),
  uploadLimiter,
  upload.single("image"),
  uploadProductImage
);

export default router;
