import Order from '../models/Order.model.js';
import Wallet from '../models/Wallet.model.js';
import Transaction from '../models/Transaction.model.js';
import BankDetail from '../models/BankDetail.model.js';
import Escrow from '../models/Escrow.model.js';
import Withdrawal from '../models/Withdrawal.model.js';
import { validateTransition } from '../utils/statusTransitions.js';
import { sendStatusNotification } from '../utils/notifications.js';
import { createTransfer, createRecipient, resolveAccountNumber } from '../utils/paystack.utils.js';
import { sequelize } from '../config/postgres.js';

/**
 * GET /api/seller/wallet
 * Returns the seller's current wallet balances (from PostgreSQL).
 */
export const getWallet = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();
    console.log("💰 getWallet called, sellerId:", sellerId);

    let wallet = await Wallet.findOne({ where: { seller_id: sellerId } });

    // If no wallet exists (new seller), create one
    if (!wallet) {
      wallet = await Wallet.create({ seller_id: sellerId });
    }

    res.status(200).json({
      success: true,
      wallet
    });
  } catch (error) {
    console.error("💰 wallet error:", error.message);
    next(error);
  }
};

/**
 * GET /api/seller/analytics/summary
 * Returns total revenue, order count, and other KPIs.
 */
export const getDashboardSummary = async (req, res, next) => {
  try {
    const sellerId = req.user._id;

    const stats = await Order.aggregate([
      { $match: { seller: sellerId, paymentStatus: 'paid' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalOrders: { $count: {} },
        }
      }
    ]);

    const totalCustomers = await Order.distinct('buyer', { seller: sellerId }).then(cats => cats.length);

    const summary = {
      totalRevenue: stats[0]?.totalRevenue || 0,
      totalOrders: stats[0]?.totalOrders || 0,
      totalCustomers: totalCustomers || 0,
      avgOrderValue: stats[0] ? (stats[0].totalRevenue / stats[0].totalOrders) : 0,
      change: 0 // In a real app, calculate this vs previous period
    };

    res.status(200).json({
      success: true,
      summary
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/seller/analytics/revenue
 * Returns daily/weekly revenue data for charts.
 */
export const getRevenueAnalytics = async (req, res, next) => {
  try {
    const sellerId = req.user._id;
    console.log("📊 getRevenueAnalytics called, sellerId:", sellerId);
    
    if (!sellerId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }
    
    const { period = 'weekly' } = req.query;

    // Last 7 days for weekly chart
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    console.log("📊 startDate:", startDate);

    const revenueData = await Order.aggregate([
      { 
        $match: { 
          seller: sellerId, 
          paymentStatus: 'paid',
          createdAt: { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: "%w", date: "$createdAt" } },
          revenue: { $sum: '$totalAmount' },
          orders: { $count: {} }
        }
      }
    ]);
    console.log("📊 revenueData:", revenueData);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const formattedData = days.map((day, index) => {
      const match = revenueData.find(d => parseInt(d._id) === index);
      return {
        label: day,
        revenue: match ? match.revenue : 0,
        orders: match ? match.orders : 0
      };
    });

    res.status(200).json({
      success: true,
      weekly: formattedData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/seller/orders
 * Returns most recent orders for this seller.
 */
export const getSellerOrders = async (req, res, next) => {
  try {
    const sellerId = req.user._id;
    const { status, limit = 5 } = req.query;

    const filter = { seller: sellerId };
    if (status && status !== 'all') {
      filter.status = status;
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('buyer', 'name email');

    // Add computed payment status to each order
    const ordersWithPayment = orders.map(order => ({
      ...order.toObject(),
      paymentStatus: order.paymentStatus || (order.isPaid ? 'paid' : 'unpaid')
    }));

    res.status(200).json({
      success: true,
      orders: ordersWithPayment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/seller/orders/:id/status
 * Updates the status of an order (e.g. Pending -> Shipped).
 * Enforces proper status transitions and validates payment requirements.
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber, carrier, description } = req.body;
    const sellerId = req.user._id;

    const order = await Order.findOne({ _id: id, seller: sellerId });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Enforce proper status transitions
    const { valid, message } = validateTransition(order.status, status, 'seller');
    if (!valid) {
      return res.status(400).json({ success: false, message });
    }

    // Check payment requirement for shipping
    const isPaid = order.paymentStatus === "Paid" || order.isPaid === true;
    if (!isPaid && ["shipped", "delivered", "collected"].includes(status.toLowerCase())) {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot progress order - payment not yet confirmed. Wait for buyer to complete payment." 
      });
    }

    const previousStatus = order.status;
    order.status = status.toLowerCase();
    
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (carrier) order.carrier = carrier;
    
    order.trackingHistory.push({
      status: status.toLowerCase(),
      description: description || `Order status updated to ${status} by seller`,
      updatedBy: sellerId
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
 * GET /api/seller/wallet/transactions
 */
export const getTransactions = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();
    const transactions = await Transaction.findAll({
      where: { seller_id: sellerId },
      order: [['created_at', 'DESC']]
    });
    res.status(200).json({ success: true, transactions });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/seller/bank-accounts
 */
export const getBankAccounts = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();
    const accounts = await BankDetail.findAll({
      where: { seller_id: sellerId }
    });
    res.status(200).json({ success: true, accounts });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/seller/bank-accounts
 * Save bank details and create Paystack transfer recipient
 */
export const addBankAccount = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();
    const { bankCode, accountNumber, accountName, isDefault } = req.body;

    // Validate required fields
    if (!bankCode || !accountNumber || !accountName) {
      return res.status(400).json({
        success: false,
        message: "bankCode, accountNumber, and accountName are required"
      });
    }

    // Resolve account number with Paystack to verify it's valid
    let resolvedName = accountName;
    try {
      const resolved = await resolveAccountNumber(accountNumber, bankCode);
      resolvedName = resolved.account_name;
    } catch (resolveErr) {
      console.warn("Could not resolve account:", resolveErr.message);
      // Continue anyway - might work for some banks
    }

    // Get bank name
    const banksList = await import('../utils/paystack.utils.js').then(m => m.getBankList());
    const bank = banksList?.find(b => b.code === bankCode);
    const bankName = bank?.name || bankCode;

    // Create transfer recipient in Paystack
    let recipientCode = null;
    try {
      const recipient = await createRecipient({
        type: 'nuban',
        name: resolvedName,
        account_number: accountNumber,
        bank_code: bankCode
      });
      recipientCode = recipient.recipient_code;
    } catch (recipientErr) {
      console.error("Failed to create recipient:", recipientErr.message);
      return res.status(400).json({
        success: false,
        message: "Failed to create bank recipient. Check bank details."
      });
    }

    // Save bank detail (if not default, make it default)
    const bankDetail = await BankDetail.create({
      seller_id: sellerId,
      bank_name: bankName,
      bank_code: bankCode,
      account_number: accountNumber,
      account_name: resolvedName,
      recipient_code: recipientCode,
      is_default: isDefault || false
    });

    res.status(201).json({
      success: true,
      message: "Bank account added successfully",
      bankDetail: {
        id: bankDetail.id,
        bank_name: bankDetail.bank_name,
        account_number: accountNumber.slice(-4), // Only last 4 digits
        account_name: bankDetail.account_name,
        is_default: bankDetail.is_default
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/seller/bank-accounts/:id
 */
export const deleteBankAccount = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();
    const { id } = req.params;

    const bankDetail = await BankDetail.findOne({
      where: { id, seller_id: sellerId }
    });

    if (!bankDetail) {
      return res.status(404).json({
        success: false,
        message: "Bank account not found"
      });
    }

    await bankDetail.destroy();

    res.status(200).json({
      success: true,
      message: "Bank account removed"
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/seller/escrow/summary
 */
export const getEscrowSummary = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();
    const escrows = await Escrow.findAll({ where: { seller_id: sellerId } });

    const summary = {
      totalHeld: escrows.filter(e => e.status === 'HELD').reduce((s, e) => s + Number(e.amount), 0),
      pendingRelease: escrows.filter(e => e.status === 'HELD' && e.delivery_status === 'DELIVERED').reduce((s, e) => s + Number(e.amount), 0),
      releasedToday: 0,
      totalReleased: escrows.filter(e => e.status === 'RELEASED').reduce((s, e) => s + Number(e.amount), 0),
    };

    res.status(200).json({ success: true, summary });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/seller/escrow
 */
export const getSellerEscrows = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();
    const escrows = await Escrow.findAll({ 
      where: { seller_id: sellerId },
      order: [['created_at', 'DESC']]
    });
    res.status(200).json({ success: true, escrows });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/seller/withdraw
 * Initiates a withdrawal request from available balance.
 * Creates a Withdrawal record and triggers Paystack transfer.
 */
export const requestWithdrawal = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();
    const { amount, bankDetailId } = req.body;

    // Validate amount
    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid withdrawal amount" });
    }

    // Get seller's wallet
    const wallet = await Wallet.findOne({ where: { seller_id: sellerId } });
    if (!wallet || parseFloat(wallet.available_balance) < withdrawalAmount) {
      return res.status(400).json({ success: false, message: "Insufficient available balance" });
    }

    // Get bank detail
    const bankDetail = await BankDetail.findOne({ 
      where: { id: bankDetailId, seller_id: sellerId }
    });
    if (!bankDetail) {
      return res.status(400).json({ success: false, message: "Bank account not found" });
    }

    // Create or get recipient code
    let recipientCode = bankDetail.recipient_code;
    if (!recipientCode) {
      // Create a transfer recipient in Paystack
      const recipientData = await createRecipient({
        type: 'nuban',
        name: bankDetail.account_name,
        account_number: bankDetail.account_number,
        bank_code: bankDetail.bank_code
      });
      recipientCode = recipientData.recipient_code;
      
      // Save recipient code to bank detail
      bankDetail.recipient_code = recipientCode;
      await bankDetail.save();
    }

    // Generate unique reference
    const reference = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const amountInKobo = Math.round(withdrawalAmount * 100);

    // Create Withdrawal record (PENDING)
    const withdrawal = await Withdrawal.create({
      seller_id: sellerId,
      amount: withdrawalAmount,
      status: 'PENDING'
    });

    // Deduct from available balance (transaction)
    await sequelize.transaction(async (t) => {
      const w = await Wallet.findOne({ where: { seller_id: sellerId }, transaction: t });
      w.available_balance = parseFloat(w.available_balance) - withdrawalAmount;
      await w.save({ transaction: t });
    });

    // Trigger Paystack transfer
    let transferResult = null;
    try {
      transferResult = await createTransfer({
        amount: amountInKobo,
        recipient: recipientCode,
        reference
      });

      // Update withdrawal with transfer ID
      withdrawal.paystack_transfer_id = transferResult.transfer_code;
      await withdrawal.save();
    } catch (transferError) {
      // If transfer fails, rollback wallet and mark withdrawal as failed
      console.error('Paystack transfer failed:', transferError.message);
      
      await sequelize.transaction(async (t) => {
        const w = await Wallet.findOne({ where: { seller_id: sellerId }, transaction: t });
        w.available_balance = parseFloat(w.available_balance) + withdrawalAmount;
        await w.save({ transaction: t });
      });
      
      withdrawal.status = 'FAILED';
      await withdrawal.save();
      
      return res.status(500).json({ 
        success: false, 
        message: "Transfer failed. Please try again." 
      });
    }

    res.status(200).json({
      success: true,
      message: "Withdrawal initiated successfully",
      withdrawal: {
        id: withdrawal.id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        reference
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/seller/withdrawals
 */
export const getWithdrawals = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();
    const withdrawals = await Withdrawal.findAll({
      where: { seller_id: sellerId },
      order: [['created_at', 'DESC']]
    });
    res.status(200).json({ success: true, withdrawals });
  } catch (error) {
    next(error);
  }
};
