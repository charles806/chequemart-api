import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  qty: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
});

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
    wishlist: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product"
    }],
  },
  { timestamps: true }
);

cartSchema.path("items").validate(
  (items) => items.length <= 50,
  "Cart cannot hold more than 50 items"
);

cartSchema.path("wishlist").validate(
  (wishlist) => wishlist.length <= 100,
  "Wishlist cannot hold more than 100 items"
);

const Cart = mongoose.model("Cart", cartSchema);

export default Cart;
