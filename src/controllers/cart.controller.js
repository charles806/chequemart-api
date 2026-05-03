import Cart from "../models/Cart.model.js";
import Product from "../models/Product.model.js";

// calculateCartTotals computes subtotal, delivery fees, and total for a cart
// Delivery fees are calculated per seller (one fee per seller in the cart)
const calculateCartTotals = (cart) => {
  if (!cart || !cart.items.length) {
    return { subtotal: 0, deliveryFee: 0, total: 0, itemsBySeller: {} };
  }

  const itemsBySeller = {};
  let subtotal = 0;
  let deliveryFee = 0;

  // Group items by seller and calculate
  for (const item of cart.items) {
    const product = item.product;
    if (!product) continue;
    
    const sellerId = product.seller?._id?.toString() || product.seller?.toString();
    if (!sellerId) continue;

    const itemTotal = (product.discountPrice || product.price) * item.qty;
    subtotal += itemTotal;

    // Add delivery fee once per seller (first item from each seller pays the fee)
    if (!itemsBySeller[sellerId]) {
      itemsBySeller[sellerId] = true;
      deliveryFee += product.deliveryFee || 0;
    }
  }

  return {
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    itemsBySeller
  };
};

export const getCart = async (req, res) => {
  try {
    // Return empty cart for unauthenticated users
    if (!req.user) {
      return res.status(200).json({
        success: true,
        data: { user: null, items: [] },
        totals: { subtotal: 0, deliveryFee: 0, total: 0 }
      });
    }
    
    let cart = await Cart.findOne({ user: req.user._id }).populate({
      path: "items.product",
      select: "name price images seller brand deliveryFee isActive",
      populate: {
        path: "seller",
        select: "storeName",
      },
    });

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    // Filter inactive products
    const activeItems = cart.items.filter(item => item.product?.isActive !== false);
    
    // Calculate totals including delivery fees
    const totals = calculateCartTotals({ ...cart.toObject(), items: activeItems });

    res.status(200).json({
      success: true,
      data: cart,
      totals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving cart",
      error: error.message,
    });
  }
};

export const addToCart = async (req, res) => {
  try {
    const { productId, qty = 1 } = req.body;
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].qty += qty;
    } else {
      cart.items.push({ product: productId, qty });
    }

    await cart.save();

    // Return populated cart
    const populatedCart = await Cart.findById(cart._id).populate("items.product");

    res.status(200).json({
      success: true,
      message: "Product added to cart",
      data: populatedCart,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding to cart",
      error: error.message,
    });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId
    );

    await cart.save();
    const populatedCart = await Cart.findById(cart._id).populate("items.product");

    res.status(200).json({
      success: true,
      message: "Product removed from cart",
      data: populatedCart,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error removing from cart",
      error: error.message,
    });
  }
};

export const updateCartQty = async (req, res) => {
  try {
    const { productId, qty } = req.body;
    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].qty = qty;
      await cart.save();
    }

    const populatedCart = await Cart.findById(cart._id).populate("items.product");

    res.status(200).json({
      success: true,
      message: "Cart updated",
      data: populatedCart,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating cart",
      error: error.message,
    });
  }
};

export const clearCart = async (req, res) => {
  try {
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] });
    res.status(200).json({
      success: true,
      message: "Cart cleared",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error clearing cart",
      error: error.message,
    });
  }
};

// WISHLIST FUNCTIONS

export const getWishlist = async (req, res) => {
  try {
    // Return empty wishlist for unauthenticated users
    if (!req.user) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }
    
    let cart = await Cart.findOne({ user: req.user._id }).populate({
      path: "wishlist",
      select: "name price images seller brand isActive",
      populate: {
        path: "seller",
        select: "storeName",
      },
    });

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [], wishlist: [] });
    }

    res.status(200).json({
      success: true,
      data: cart.wishlist || [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving wishlist",
      error: error.message,
    });
  }
};

export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [], wishlist: [] });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Check if already in wishlist
    if (cart.wishlist && cart.wishlist.includes(productId)) {
      return res.status(400).json({ success: false, message: "Product already in wishlist" });
    }

    if (!cart.wishlist) {
      cart.wishlist = [];
    }
    cart.wishlist.push(productId);
    await cart.save();

    res.status(200).json({
      success: true,
      message: "Product added to wishlist",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding to wishlist",
      error: error.message,
    });
  }
};

export const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({ success: false, message: "Wishlist not found" });
    }

    cart.wishlist = cart.wishlist.filter(
      (id) => id.toString() !== productId
    );

    await cart.save();

    res.status(200).json({
      success: true,
      message: "Product removed from wishlist",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error removing from wishlist",
      error: error.message,
    });
  }
};
