import express from "express";
import { 
  getCart, 
  addToCart, 
  removeFromCart, 
  updateCartQty, 
  clearCart,
  getWishlist,
  addToWishlist,
  removeFromWishlist
} from "../controllers/cart.controller.js";
import { protect, optionalAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

// Read operations - optional auth (works for logged in and logged out users)
router.get("/", optionalAuth, getCart);
router.get("/wishlist", optionalAuth, getWishlist);

// Write operations - protected (require auth)
router.post("/add", protect, addToCart);
router.put("/update", protect, updateCartQty);
router.delete("/remove/:productId", protect, removeFromCart);
router.delete("/clear", protect, clearCart);
router.post("/wishlist/add", protect, addToWishlist);
router.delete("/wishlist/remove/:productId", protect, removeFromWishlist);

export default router;
