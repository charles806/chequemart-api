import express from 'express';
import crypto from 'crypto';
import Order from '../models/Order.model.js';
import Escrow from '../models/Escrow.model.js';
import User from '../models/User.model.js';
import { sequelize } from '../config/postgres.js';
import Wallet from '../models/Wallet.model.js';
import Withdrawal from '../models/Withdrawal.model.js';
import WebhookEvent from '../models/WebhookEvent.model.js';
import { verifyTransaction } from '../utils/paystack.utils.js';
import logger from '../utils/logger.js';

const router = express.Router();

function verifyPaystackSignature(req, res, next) {
  const signature = req.headers['x-paystack-signature'];
  if (!signature) {
    logger.warn({ eventId: req.headers['x-paystack-eventid'] }, 'Webhook received without signature');
    return res.status(401).send('No signature');
  }

  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(req.body)
    .digest('hex');

  if (hash !== signature) {
    logger.warn({ eventId: req.headers['x-paystack-eventid'] }, 'Webhook signature mismatch');
    return res.status(401).send('Invalid signature');
  }
  next();
}

router.post('/paystack', verifyPaystackSignature, async (req, res) => {
  const eventId = req.headers['x-paystack-eventid'];
  let event;

  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch (parseErr) {
    logger.error({ err: parseErr, eventId }, 'Webhook failed to parse payload');
    return res.sendStatus(400);
  }

  const eventType = event.event;
  const reference = event.data?.reference;

  logger.info({ eventType, eventId, reference }, 'Webhook received');

  if (eventId) {
    try {
      const existing = await WebhookEvent.findOne({ eventId, status: 'processed' });
      if (existing) {
        logger.info({ eventId }, 'Webhook duplicate event, skipping');
        return res.sendStatus(200);
      }
    } catch (dbErr) {
      logger.error({ err: dbErr, eventId }, 'Webhook idempotency check failed');
    }
  } else {
    logger.warn({ eventType, reference }, 'Webhook received without eventId — idempotency disabled');
  }

  try {
    if (eventType === 'charge.success') {
      await handleChargeSuccess(event.data);
    } else if (eventType === 'transfer.success') {
      await handleTransferSuccess(event.data);
    } else if (eventType === 'transfer.failed') {
      await handleTransferFailed(event.data);
    } else if (eventType === 'transfer.reversed') {
      await handleTransferReversed(event.data);
    } else {
      logger.info({ eventType }, 'Webhook unhandled event type');
    }

    if (eventId) {
      await WebhookEvent.create({ eventId, eventType, reference, status: 'processed' })
        .catch((err) => logger.warn({ err, eventId }, 'Failed to save idempotency record'));
    }

    logger.info({ eventId, eventType, reference }, 'Webhook processed successfully');
    res.sendStatus(200);
  } catch (err) {
    logger.error({ err, eventType, eventId, reference }, 'Webhook processing failed');

    if (eventId) {
      await WebhookEvent.create({ eventId, eventType, reference, status: 'failed' })
        .catch(() => {});
    }

    res.sendStatus(500);
  }
});

async function handleChargeSuccess(data) {
  const reference = data.reference;

  if (!reference) {
    logger.warn({}, 'Webhook charge.success: no reference provided');
    return;
  }

  const existingOrder = await Order.findOne({ paymentReference: reference });
  if (existingOrder && existingOrder.isPaid) {
    logger.info({ orderId: existingOrder._id }, 'Webhook charge.success: order already paid, skipping');
    return;
  }

  let verifiedData = data;
  try {
    const verification = await verifyTransaction(reference);
    verifiedData = verification.data;

    if (verification.data.status !== 'success') {
      logger.warn({ status: verification.data.status }, 'Webhook charge.success: Paystack verification failed');
      await Order.updateMany(
        { paymentReference: reference },
        { paymentStatus: 'failed', isPaid: false }
      );
      logger.info({ reference }, 'Webhook charge.success: order marked as failed');
      return;
    }

    logger.info({ reference }, 'Webhook charge.success: Paystack verification passed');
  } catch (verifyErr) {
    logger.warn({ err: verifyErr, reference }, 'Webhook charge.success: could not verify with Paystack');
  }

  const orders = await Order.find({ paymentReference: reference });
  if (orders.length === 0) {
    logger.warn({ reference }, 'Webhook charge.success: orders not found for reference');
    return;
  }

  logger.info({ count: orders.length, reference }, 'Webhook charge.success: processing orders');

  for (const order of orders) {
    if (order.isPaid) {
      logger.info({ orderId: order._id }, 'Webhook charge.success: order already paid');
      continue;
    }

    order.isPaid = true;
    order.paymentStatus = 'paid';
    order.status = 'processing';
    order.paidAt = new Date();
    await order.save();
    logger.info({ orderId: order._id }, 'Webhook charge.success: order marked as paid');

    await Escrow.update(
      { status: 'HELD', paystack_reference: reference },
      { where: { order_id: order._id.toString() } }
    );
    logger.info({ orderId: order._id }, 'Webhook charge.success: escrow updated');

    try {
      const escrowRec = await Escrow.findOne({ where: { order_id: order._id.toString() } });
      if (escrowRec) {
        const { default: EscrowEvent } = await import('../models/EscrowEvent.model.js');
        await EscrowEvent.create({
          escrow_id: escrowRec.id,
          event_type: 'CREATED',
          triggered_by: 'SYSTEM',
          metadata: { order_id: order._id.toString(), amount: escrowRec.amount },
        });
      }
    } catch (evtErr) {
      logger.error({ err: evtErr, orderId: order._id }, 'Webhook EscrowEvent creation failed');
    }

    const sellerId = order.seller.toString();
    try {
      await sequelize.transaction(async (t) => {
        let wallet = await Wallet.findOne({ where: { seller_id: sellerId }, transaction: t });

        if (!wallet) {
          wallet = await Wallet.create({
            seller_id: sellerId,
            available_balance: 0,
            pending_balance: 0,
            total_earned: 0
          }, { transaction: t });
        }

        const escrow = await Escrow.findOne({
          where: { order_id: order._id.toString() },
          transaction: t
        });

        if (escrow) {
          const sellerAmount = parseFloat(escrow.seller_amount);
          wallet.pending_balance = parseFloat(wallet.pending_balance) + sellerAmount;
          await wallet.save({ transaction: t });
          logger.info({ sellerId, amount: sellerAmount }, 'Webhook charge.success: credited seller pending balance');
        }
      });
    } catch (walletError) {
      logger.error({ err: walletError, sellerId, orderId: order._id }, 'Webhook charge.success: failed to credit seller wallet');
      throw walletError;
    }

    const { default: logTransaction } = await import('../utils/transactionLogger.js');
    const escrowForLog = await Escrow.findOne({ where: { order_id: order._id.toString() } });
    await logTransaction({
      type: 'CREDIT',
      amount: escrowForLog ? parseFloat(escrowForLog.seller_amount) : 0,
      sellerId,
      orderId: order._id.toString(),
      reference,
      description: `Payment received for order ${order._id}`,
    });

    logger.info({ orderId: order._id, amount: verifiedData.amount / 100 }, 'Webhook charge.success: done processing order');
  }
}

async function handleTransferSuccess(data) {
  const transferCode = data.transfer_code;
  logger.info({ transferCode }, 'Webhook transfer.success');

  try {
    const withdrawal = await Withdrawal.findOne({
      where: { paystack_transfer_id: transferCode }
    });

    if (withdrawal) {
      withdrawal.status = 'SUCCESS';
      await withdrawal.save();
      const { default: logTransaction } = await import('../utils/transactionLogger.js');
      await logTransaction({
        type: 'DEBIT',
        amount: withdrawal.amount,
        sellerId: withdrawal.seller_id,
        reference: transferCode,
        description: 'Withdrawal completed',
      });
      logger.info({ withdrawalId: withdrawal.id }, 'Webhook transfer.success: withdrawal marked SUCCESS');
    } else {
      logger.warn({ transferCode }, 'Webhook transfer.success: no withdrawal found');
    }
  } catch (err) {
    logger.error({ err, transferCode }, 'Webhook transfer.success: failed to update withdrawal');
    throw err;
  }
}

async function handleTransferFailed(data) {
  const transferCode = data.transfer_code;
  logger.error({ transferCode }, 'Webhook transfer.failed');

  try {
    const withdrawal = await Withdrawal.findOne({
      where: { paystack_transfer_id: transferCode }
    });

    if (!withdrawal) {
      logger.warn({ transferCode }, 'Webhook transfer.failed: no withdrawal found');
      return;
    }

    await sequelize.transaction(async (t) => {
      const wallet = await Wallet.findOne({
        where: { seller_id: withdrawal.seller_id },
        transaction: t
      });
      if (wallet) {
        wallet.available_balance = parseFloat(wallet.available_balance) + parseFloat(withdrawal.amount);
        await wallet.save({ transaction: t });
        logger.info({ amount: withdrawal.amount, sellerId: withdrawal.seller_id }, 'Webhook transfer.failed: restored to seller');
      }
    });

    withdrawal.status = 'FAILED';
    await withdrawal.save();
    logger.info({ withdrawalId: withdrawal.id }, 'Webhook transfer.failed: withdrawal marked FAILED');
  } catch (err) {
    logger.error({ err, transferCode }, 'Webhook transfer.failed: error');
    throw err;
  }
}

async function handleTransferReversed(data) {
  const transferCode = data.transfer_code;
  logger.warn({ transferCode }, 'Webhook transfer.reversed');
}

export default router;
