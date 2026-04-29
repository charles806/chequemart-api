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
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect); // All cart routes are protected

router.get("/", getCart);
router.post("/add", addToCart);
router.put("/update", updateCartQty);
router.delete("/remove/:productId", removeFromCart);
router.delete("/clear", clearCart);

// Wishlist routes
router.get("/wishlist", getWishlist);
router.post("/wishlist/add", addToWishlist);
router.delete("/wishlist/remove/:productId", removeFromWishlist);

export default router;
