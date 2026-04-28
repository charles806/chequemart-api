import express from "express";
import { 
  getCart, 
  addToCart, 
  removeFromCart, 
  updateCartQty, 
  clearCart 
} from "../controllers/cart.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect); // All cart routes are protected

router.get("/", getCart);
router.post("/add", addToCart);
router.put("/update", updateCartQty);
router.delete("/remove/:productId", removeFromCart);
router.delete("/clear", clearCart);

export default router;
