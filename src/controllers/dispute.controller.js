import Dispute from '../models/Dispute.model.js';
import Escrow from '../models/Escrow.model.js';
import Order from '../models/Order.model.js';
import { sequelize } from '../config/postgres.js';
import Wallet from '../models/Wallet.model.js';

/**
 * POST /api/disputes
 * Buyer raises a dispute for an order.
 */
export const createDispute = async (req, res, next) => {
  try {
    const { orderId, reason, description, evidenceUrls } = req.body;
    const buyerId = req.user._id.toString();

    // Verify order exists and belongs to buyer
    const order = await Order.findOne({ _id: orderId, buyer: req.user._id });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found or not owned by you" });
    }

    // Check if order is in a valid state for dispute
    if (!['shipped', 'delivered'].includes(order.status)) {
      return res.status(400).json({ 
        success: false, 
        message: "Can only dispute shipped or delivered orders" 
      });
    }

    // Check for existing dispute
    const existingDispute = await Dispute.findOne({ 
      where: { order_id: orderId, status: ['OPEN', 'UNDER_REVIEW'] }
    });
    if (existingDispute) {
      return res.status(400).json({ 
        success: false, 
        message: "A dispute already exists for this order" 
      });
    }

    // Create dispute
    const dispute = await Dispute.create({
      order_id: orderId,
      buyer_id: buyerId,
      seller_id: order.seller.toString(),
      reason,
      description,
      evidence_urls: evidenceUrls || [],
      status: 'OPEN'
    });

    // Lock escrow to DISPUTED status
    await Escrow.update(
      { status: 'DISPUTED' },
      { where: { order_id: orderId } }
    );

    // Update order status
    order.status = 'disputed';
    order.trackingHistory.push({
      status: 'disputed',
      description: 'Buyer raised a dispute',
      updatedBy: buyerId
    });
    await order.save();

    res.status(201).json({
      success: true,
      message: "Dispute raised successfully",
      dispute
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/disputes
 * Get buyer's disputes.
 */
export const getMyDisputes = async (req, res, next) => {
  try {
    const buyerId = req.user._id.toString();
    const disputes = await Dispute.findAll({
      where: { buyer_id: buyerId },
      order: [['created_at', 'DESC']]
    });
    res.status(200).json({ success: true, disputes });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/disputes/:id
 * Get dispute details.
 */
export const getDisputeById = async (req, res, next) => {
  try {
    const dispute = await Dispute.findByPk(req.params.id);
    
    if (!dispute) {
      return res.status(404).json({ success: false, message: "Dispute not found" });
    }

    const buyerId = req.user._id.toString();
    const isOwner = dispute.buyer_id === buyerId;
    const isSeller = dispute.seller_id === buyerId;
    const isAdmin = req.user.role === 'admin';

    // Allow buyer, seller, or admin
    if (!isOwner && !isSeller && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    res.status(200).json({ success: true, dispute });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/disputes/seller
 * Get seller's disputes.
 */
export const getSellerDisputes = async (req, res, next) => {
  try {
    const sellerId = req.user._id.toString();
    const disputes = await Dispute.findAll({
      where: { seller_id: sellerId },
      order: [['created_at', 'DESC']]
    });
    res.status(200).json({ success: true, disputes });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/disputes/:id/respond
 * Seller responds to a dispute.
 */
export const respondToDispute = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { response, evidenceUrls } = req.body;
    const sellerId = req.user._id.toString();

    const dispute = await Dispute.findByPk(id);
    if (!dispute) {
      return res.status(404).json({ success: false, message: "Dispute not found" });
    }

    if (dispute.seller_id !== sellerId) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    if (dispute.status !== 'OPEN') {
      return res.status(400).json({ success: false, message: "Dispute is not open for response" });
    }

    // Add seller response to description
    dispute.description = `${dispute.description}\n\n[Seller Response]: ${response}`;
    if (evidenceUrls) {
      dispute.evidence_urls = [...(dispute.evidence_urls || []), ...evidenceUrls];
    }
    dispute.status = 'UNDER_REVIEW';
    await dispute.save();

    res.status(200).json({
      success: true,
      message: "Response submitted",
      dispute
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/disputes/:id/resolve
 * Admin resolves a dispute.
 */
export const resolveDispute = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { resolution, adminNotes } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const dispute = await Dispute.findByPk(id);
    if (!dispute) {
      return res.status(404).json({ success: false, message: "Dispute not found" });
    }

    if (!['REFUND_BUYER', 'RELEASE_ESCROW', 'CANCEL_DISPUTE'].includes(resolution)) {
      return res.status(400).json({ success: false, message: "Invalid resolution" });
    }

    dispute.resolution = resolution;
    dispute.admin_notes = adminNotes;
    dispute.status = 'RESOLVED';
    dispute.resolved_at = new Date();
    await dispute.save();

    // Handle resolution
    const orderId = dispute.order_id;
    
    if (resolution === 'REFUND_BUYER') {
      // Refund buyer - release to buyer's wallet (simplified - actual refund via payment)
      await Escrow.update(
        { status: 'REFUNDED' },
        { where: { order_id: orderId } }
      );
      
      // Update order
      await Order.findByIdAndUpdate(orderId, { status: 'refunded' });
    } else if (resolution === 'RELEASE_ESCROW') {
      // Release to seller
      await Escrow.update(
        { status: 'RELEASED' },
        { where: { order_id: orderId } }
      );

      // Move funds to seller's available balance
      await sequelize.transaction(async (t) => {
        const escrow = await Escrow.findOne({ where: { order_id: orderId }, transaction: t });
        if (escrow) {
          const wallet = await Wallet.findOne({ 
            where: { seller_id: dispute.seller_id }, 
            transaction: t 
          });
          if (wallet) {
            wallet.pending_balance = Math.max(0, parseFloat(wallet.pending_balance) - parseFloat(escrow.seller_amount));
            wallet.available_balance = parseFloat(wallet.available_balance) + parseFloat(escrow.seller_amount);
            await wallet.save({ transaction: t });
          }
        }
      });
    } else if (resolution === 'CANCEL_DISPUTE') {
      // Cancel dispute, restore escrow to previous state
      const escrow = await Escrow.findOne({ where: { order_id: orderId } });
      const previousStatus = escrow?.delivery_status === 'DELIVERED' ? 'RELEASED' : 'HELD';
      await Escrow.update(
        { status: previousStatus },
        { where: { order_id: orderId } }
      );
    }

    res.status(200).json({
      success: true,
      message: `Dispute resolved with ${resolution}`,
      dispute
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/disputes/admin
 * Admin gets all disputes.
 */
export const getAllDisputes = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const { status } = req.query;
    const where = status ? { status } : {};
    
    const disputes = await Dispute.findAll({
      where,
      order: [['created_at', 'DESC']]
    });
    res.status(200).json({ success: true, disputes });
  } catch (error) {
    next(error);
  }
};