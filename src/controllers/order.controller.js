import Order from '../models/Order.model.js';
import Product from '../models/Product.model.js';
import Escrow from '../models/Escrow.model.js';
import User from '../models/User.model.js';
import { sequelize } from '../config/postgres.js';
import Wallet from '../models/Wallet.model.js';
import { initializeTransaction, createBulkSplit, listSplits } from '../utils/paystack.utils.js';
import { validateTransition } from '../utils/statusTransitions.js';
import { sendStatusNotification } from '../utils/notifications.js';

// Dynamic tiered commission per PRD Section 4.1:
// Orders below ₦50,000 → 5% commission
// Orders ₦50,000 and above → 10% commission
const getCommissionRate = (orderAmount) => orderAmount >= 50000 ? 0.10 : 0.05;

// Flat fallback rate for Paystack split calculations where per-order tiering isn't possible
const COMMISSION_RATE = (parseFloat(process.env.COMMISSION_RATE)) / 100 || 0.05;

/**
 * @desc    Create new orders from cart items
 * @route   POST /api/orders
 * @access  Private (Buyer)
 */
export const createOrder = async (req, res, next) => {
  try {
    const { items, shippingAddress } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: "No items in order" });
    }

    // Fetch all products in one query to avoid N+1 performance issue
    const productIds = items.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    
    // Create a map for quick lookup
    const productMap = new Map();
    for (const p of products) {
      productMap.set(p._id.toString(), p);
    }

    // Validate all products exist
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product ${item.productId} not found` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }
    }

    // In a multi-vendor marketplace, we group items by seller
    // Each seller gets a separate order record
    const sellersMap = new Map();

    for (const item of items) {
      const product = productMap.get(item.productId);

      const sellerId = product.seller.toString();
      if (!sellersMap.has(sellerId)) {
        sellersMap.set(sellerId, {
          seller: product.seller,
          buyer: req.user._id,
          products: [],
          totalAmount: 0,
          shippingAddress
        });
      }

      const sellerOrder = sellersMap.get(sellerId);
      sellerOrder.products.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        image: product.images[0]
      });
      sellerOrder.totalAmount += product.price * item.quantity;
      
      // Update stock
      product.stock -= item.quantity;
    }

    // Batch update stock for all products
    const stockUpdates = products.map(p => ({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { stock: p.stock } }
      }
    }));
    if (stockUpdates.length > 0) {
      await Product.bulkWrite(stockUpdates);
    }

    const createdOrders = [];
    for (const orderData of sellersMap.values()) {
      // 1. Create Order in MongoDB
      const order = await Order.create(orderData);
      
      // 2. 🛡️ Create Escrow record in PostgreSQL
      const commissionRate = getCommissionRate(order.totalAmount);
      const commission = order.totalAmount * commissionRate;
      const sellerAmount = order.totalAmount - commission;

      try {
        const escrow = await Escrow.create({
          order_id: order._id.toString(),
          buyer_id: order.buyer.toString(),
          seller_id: order.seller.toString(),
          amount: order.totalAmount,
          commission: commission,
          seller_amount: sellerAmount,
          status: 'HELD'
        });

        // Link escrow back to order in MongoDB
        order.escrowId = escrow.id;
        await order.save();
      } catch (escrowError) {
        console.error("⚠️ Failed to create escrow for order:", order._id, escrowError.message);
        // We continue anyway, as the order itself is created. 
        // In a production app, we'd wrap this in a transaction.
      }

      createdOrders.push(order);
    }

    res.status(201).json({
      success: true,
      message: "Order(s) created and funds moved to escrow",
      orders: createdOrders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get logged in user's orders
 * @route   GET /api/orders
 * @access  Private (Buyer)
 */
export const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ buyer: req.user._id })
      .sort({ createdAt: -1 })
      .populate('seller', 'name storeName');

    res.status(200).json({
      success: true,
      orders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get order by ID
 * @route   GET /api/orders/:id
 * @access  Private
 */
export const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('seller', 'name storeName')
      .populate('buyer', 'name email');

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check permissions
    const isBuyer = order.buyer._id.toString() === req.user._id.toString();
    const isSeller = order.seller._id.toString() === req.user._id.toString();

    if (!isBuyer && !isSeller && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "Not authorized to view this order" });
    }

    res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel an order
 * @route   PATCH /api/orders/:id/cancel
 * @access  Private (Buyer)
 */
export const cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const isBuyer = order.buyer.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const isSeller = order.seller.toString() === req.user._id.toString();

    let role = 'unauthorized';
    if (isAdmin) role = 'admin';
    else if (isBuyer) role = 'buyer';
    else if (isSeller) role = 'seller';

    const { valid, message } = validateTransition(order.status, 'cancelled', role);
    if (!valid) {
      return res.status(400).json({ success: false, message });
    }

    const previousStatus = order.status;
    order.status = 'cancelled';
    order.trackingHistory.push({
      status: 'cancelled',
      description: `Order cancelled by ${role}`,
      updatedBy: req.user._id
    });
    await order.save();

    // Restore stock
    for (const item of order.products) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
    }

    await sendStatusNotification(order, previousStatus);

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Confirm order (Admin confirms processing -> confirmed)
 * @route   PATCH /api/orders/:id/confirm
 * @access  Private (Admin)
 */
export const confirmOrder = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "Only admin can confirm orders" });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const { valid, message } = validateTransition(order.status, 'confirmed', 'admin');
    if (!valid) {
      return res.status(400).json({ success: false, message });
    }

    const previousStatus = order.status;
    order.status = 'confirmed';
    order.trackingHistory.push({
      status: 'confirmed',
      description: 'Order confirmed by admin',
      updatedBy: req.user._id
    });
    await order.save();

    await sendStatusNotification(order, previousStatus);

    res.status(200).json({
      success: true,
      message: "Order confirmed by admin",
      order
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark as Received (Buyer confirms receipt: shipped -> delivered)
 * @route   PATCH /api/orders/:id/receive
 * @access  Private (Buyer)
 */
export const markReceived = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, buyer: req.user._id });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found or not owned by you" });
    }

    const { valid, message } = validateTransition(order.status, 'delivered', 'buyer');
    if (!valid) {
      return res.status(400).json({ success: false, message });
    }

    const previousStatus = order.status;
    order.status = 'delivered';
    order.trackingHistory.push({
      status: 'delivered',
      description: 'Order marked as received by buyer',
      updatedBy: req.user._id
    });
    
    // Automatically set to collected for seller logic
    // In some flows, 'collected' might be a separate step or just the seller's view of 'delivered'
    // Requirement says: Buyer status -> Delivered, Seller status -> Collected
    
    await order.save();

    // Release escrow funds to seller's available balance in Postgres
    // This moves fund from HELD -> RELEASED and updates wallet
    try {
      const sellerId = order.seller.toString();
      
      // Find escrow record for this order
      const escrow = await Escrow.findOne({ where: { order_id: order._id.toString() } });
      if (escrow && escrow.status === 'HELD') {
        // Update escrow status to RELEASED
        escrow.status = 'RELEASED';
        await escrow.save();

        // Update seller's wallet: pending -> available
        // Use transaction for atomicity
        await sequelize.transaction(async (t) => {
          const wallet = await Wallet.findOne({ where: { seller_id: sellerId }, transaction: t });
          
          if (wallet) {
            const sellerAmount = parseFloat(escrow.seller_amount);
            
            // Move from pending to available
            wallet.pending_balance = Math.max(0, parseFloat(wallet.pending_balance) - sellerAmount);
            wallet.available_balance = parseFloat(wallet.available_balance) + sellerAmount;
            wallet.total_earned = parseFloat(wallet.total_earned) + sellerAmount;
            
            await wallet.save({ transaction: t });
            console.log(`[Wallet] Released ${sellerAmount} to seller ${sellerId} available balance`);
          }
        });
      }
    } catch (walletError) {
      // Log error but don't fail the request - order delivery is confirmed
      console.error('Failed to release escrow funds:', walletError.message);
    }

    await sendStatusNotification(order, previousStatus);

    res.status(200).json({
      success: true,
      message: "Order marked as received",
      order
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update order status (Seller updates order state)
 * @route   PATCH /api/orders/:id/status
 * @access  Private (Seller/Admin)
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { status, trackingNumber, carrier, description } = req.body;
    
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const isSeller = order.seller.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isSeller && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    const role = isAdmin ? 'admin' : 'seller';
    const { valid, message } = validateTransition(order.status, status, role);
    if (!valid) {
      return res.status(400).json({ success: false, message });
    }

    // Special check for shipping: must be paid
    if (status === 'shipped' && !order.isPaid) {
      return res.status(400).json({ success: false, message: "Cannot ship unpaid order" });
    }

    const previousStatus = order.status;
    order.status = status;
    
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (carrier) order.carrier = carrier;
    
    order.trackingHistory.push({
      status,
      description: description || `Order status updated to ${status} by ${role}`,
      updatedBy: req.user._id
    });

    await order.save();

    await sendStatusNotification(order, previousStatus);

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      order
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Initialize Paystack Payment with Dynamic Split for Multi-Vendor
 * @route   POST /api/orders/initialize-payment
 * @access  Private (Buyer)
 */
export const initializePayment = async (req, res, next) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, message: "No orders provided for payment" });
    }

    // 1. Fetch orders
    const orders = await Order.find({ _id: { $in: orderIds }, buyer: req.user._id });
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "Orders not found" });
    }

    // 2. Calculate total amount (in kobo for Paystack)
    const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const amountInKobo = Math.round(totalAmount * 100);

    // 3. Handle Dynamic Split Payment for Multiple Sellers
    const uniqueSellers = [...new Set(orders.map(o => o.seller.toString()))];
    
    if (uniqueSellers.length > 1) {
      // Multi-vendor: Use Paystack dynamic split
      // Build subaccounts array with each seller's share (minus commission)
      const subaccounts = [];
      
      for (const sellerId of uniqueSellers) {
        const seller = await User.findById(sellerId);
        if (seller?.sellerInfo?.paystackSubaccountCode) {
          // Calculate what percentage goes to this seller
          const sellerOrders = orders.filter(o => o.seller.toString() === sellerId);
          const sellerTotal = sellerOrders.reduce((sum, o) => sum + o.totalAmount, 0);
          const sellerShare = sellerTotal * (1 - getCommissionRate(sellerTotal));
          
          // Calculate percentage share (e.g., 8000 = 80% in Paystack's base)
          const sharePercent = Math.round((sellerShare / totalAmount) * 10000);
          
          subaccounts.push({
            subaccount: seller.sellerInfo.paystackSubaccountCode,
            share: sharePercent
          });
        }
      }

      if (subaccounts.length > 0) {
        // Create a one-time split configuration
        try {
          const splitConfig = await createBulkSplit({
            name: `split_${Date.now()}`,
            subaccounts
          });
          
          const result = await initializeTransaction({
            email: req.user.email,
            amount: amountInKobo,
            metadata: {
              orderIds,
              buyerId: req.user._id,
              custom_fields: [
                { display_name: "Order IDs", variable_name: "order_ids", value: orderIds.join(', ') }
              ]
            },
            split_code: splitConfig.split_code,
            callback_url: `${process.env.CLIENT_URL}/orders`,
            return_url: `${process.env.CLIENT_URL}/orders`
          });

          // Store payment reference on orders for later verification
          const paymentReference = result.reference;
          await Order.updateMany(
            { _id: { $in: orderIds } },
            { paymentReference }
          );

          return res.status(200).json({
            success: true,
            data: result
          });
        } catch (splitError) {
          console.error('Failed to create split:', splitError.message);
          // Fall through to simple payment without split
        }
      }
    }

    // 4. Single seller: Use simple subaccount (existing logic)
    let subaccount = null;
    let transaction_charge = null;

    if (uniqueSellers.length === 1) {
      const seller = await User.findById(uniqueSellers[0]);
      if (seller?.sellerInfo?.paystackSubaccountCode) {
        subaccount = seller.sellerInfo.paystackSubaccountCode;
        transaction_charge = Math.round(amountInKobo * getCommissionRate(totalAmount));
      }
    }

    // 5. Call Paystack
    const result = await initializeTransaction({
      email: req.user.email,
      amount: amountInKobo,
      metadata: {
        orderIds,
        buyerId: req.user._id,
        custom_fields: [
          { display_name: "Order IDs", variable_name: "order_ids", value: orderIds.join(', ') }
        ]
      },
      subaccount,
      transaction_charge,
      callback_url: `${process.env.CLIENT_URL}/orders`,
      return_url: `${process.env.CLIENT_URL}/orders`
    });

    // Store payment reference on orders for later verification
    const paymentReference = result.reference;
    await Order.updateMany(
      { _id: { $in: orderIds } },
      { paymentReference }
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Payment Initialization Error:", error.message);
    next(error);
  }
};
