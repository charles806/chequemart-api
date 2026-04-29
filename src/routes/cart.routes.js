import express from "express";
import { 
  getCart, 
  addToCart, 
  removeFromCart, 
  updateCartQty, 
<<<<<<< HEAD
  clearCart 
=======
  clearCart,
  getWishlist,
  addToWishlist,
  removeFromWishlist
>>>>>>> cba3093 (Clean: remove Stripe secret completely)
} from "../controllers/cart.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect); // All cart routes are protected

router.get("/", getCart);
router.post("/add", addToCart);
router.put("/update", updateCartQty);
router.delete("/remove/:productId", removeFromCart);
router.delete("/clear", clearCart);

<<<<<<< HEAD
=======
// Wishlist routes
router.get("/wishlist", getWishlist);
router.post("/wishlist/add", addToWishlist);
router.delete("/wishlist/remove/:productId", removeFromWishlist);

>>>>>>> cba3093 (Clean: remove Stripe secret completely)
export default router;
