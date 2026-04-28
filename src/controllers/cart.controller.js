import Cart from "../models/Cart.model.js";

export const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate({
      path: "items.product",
      select: "name price images seller brand",
      populate: {
        path: "seller",
        select: "storeName",
      },
    });

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    res.status(200).json({
      success: true,
      data: cart,
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
