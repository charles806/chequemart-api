import Order from '../models/Order.model.js';
import Wallet from '../models/Wallet.model.js';
import Transaction from '../models/Transaction.model.js';
import BankDetail from '../models/BankDetail.model.js';
import Escrow from '../models/Escrow.model.js';
import mongoose from 'mongoose';

/**
 * GET /api/seller/wallet
 * Returns the seller's current wallet balances (from PostgreSQL).
 */
export const getWallet = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();

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
          _id: { $dateToString: { format: "%a", date: "$createdAt" } }, // Mon, Tue, etc.
          revenue: { $sum: '$totalAmount' },
          orders: { $count: {} }
        }
      }
    ]);

    // Ensure all 7 days are present with 0 if no data
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const formattedData = days.map(day => {
      const match = revenueData.find(d => d._id === day);
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

    res.status(200).json({
      success: true,
      orders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/seller/orders/:id/status
 * Updates the status of an order (e.g. Pending -> Shipped).
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const sellerId = req.user._id;

    const order = await Order.findOne({ _id: id, seller: sellerId });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Basic transition validation could be added here
    order.status = status;
    await order.save();

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
