import Cart from "../models/Cart.model.js";
import Product from "../models/Product.model.js";

// calculateCartTotals computes subtotal, delivery fees, and total for a cart
// Delivery fees are calculated per seller (one fee per seller in the cart)
// controllers/cart.controller.js

import Cart from "../models/Cart.model.js";
import Product from "../models/Product.model.js";

/**
 * CALCULATE CART TOTALS
 */
const calculateCartTotals = (cart) => {
  try {
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return {
        subtotal: 0,
        deliveryFee: 0,
        total: 0,
      };
    }

    let subtotal = 0;
    let deliveryFee = 0;

    const sellerMap = new Set();

    for (const item of cart.items) {
      if (!item?.product) continue;

      const product = item.product;

      const price =
        Number(product.discountPrice || product.price || 0);

      const qty = Number(item.qty || 0);

      subtotal += price * qty;

      const sellerId =
        product?.seller?._id?.toString() ||
        product?.seller?.toString();

      if (sellerId && !sellerMap.has(sellerId)) {
        sellerMap.add(sellerId);

        deliveryFee += Number(product.deliveryFee || 0);
      }
    }

    return {
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
    };
  } catch (error) {
    console.error("[CALCULATE TOTALS ERROR]", error);

    return {
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
    };
  }
};

/**
 * GET CART
 */
export const getCart = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(200).json({
        success: true,
        data: {
          items: [],
        },
        totals: {
          subtotal: 0,
          deliveryFee: 0,
          total: 0,
        },
      });
    }

    let cart = await Cart.findOne({
      user: req.user._id,
    }).populate({
      path: "items.product",
      select:
        "name price discountPrice images seller brand deliveryFee isActive",
      populate: {
        path: "seller",
        select: "storeName",
      },
    });

    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: [],
      });
    }

    const safeItems = Array.isArray(cart.items)
      ? cart.items.filter(
          (item) =>
            item &&
            item.product &&
            item.product.isActive !== false
        )
      : [];

    const totals = calculateCartTotals({
      ...cart.toObject(),
      items: safeItems,
    });

    return res.status(200).json({
      success: true,
      data: {
        ...cart.toObject(),
        items: safeItems,
      },
      totals,
    });
  } catch (error) {
    console.error("[GET CART ERROR]", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve cart",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};

/**
 * ADD TO CART
 */
export const addToCart = async (req, res) => {
  try {
    const { productId, qty = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let cart = await Cart.findOne({
      user: req.user._id,
    });

    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: [],
      });
    }

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].qty += Number(qty);
    } else {
      cart.items.push({
        product: productId,
        qty: Number(qty),
      });
    }

    await cart.save();

    const updatedCart = await Cart.findById(cart._id).populate(
      "items.product"
    );

    return res.status(200).json({
      success: true,
      message: "Added to cart",
      data: updatedCart,
    });
  } catch (error) {
    console.error("[ADD TO CART ERROR]", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add to cart",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
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
