import { Router } from "express";
import multer from "multer";
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

// POST /api/upload/product-image
// Only sellers and admins can upload product images
router.post(
  "/product-image",
  protect,
  restrictTo("seller", "admin"),
  upload.single("image"),
  uploadProductImage
);

export default router;
