import express from 'express';
import crypto from 'crypto';
import Order from '../models/Order.model.js';
import Escrow from '../models/Escrow.model.js';
import User from '../models/User.model.js';

const router = express.Router();

function verifyPaystackSignature(req, res, next) {
  const signature = req.headers['x-paystack-signature'];
  if (!signature) {
    console.warn('Webhook received without signature');
    return res.status(401).send('No signature');
  }

  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== signature) {
    console.warn('Webhook signature mismatch');
    return res.status(401).send('Invalid signature');
  }
  next();
}

router.post('/paystack', verifyPaystackSignature, async (req, res) => {
  res.sendStatus(200);

  const event = req.body;
  const eventType = event.event;
  const eventId = event.id || `${event.event}-${Date.now()}`;

  console.log('Webhook received:', eventType, eventId);

  try {
    if (eventType === 'charge.success') {
      await handleChargeSuccess(event.data);
    } else if (eventType === 'transfer.success') {
      await handleTransferSuccess(event.data);
    } else if (eventType === 'transfer.failed') {
      await handleTransferFailed(event.data);
    } else if (eventType === 'transfer.reversed') {
      await handleTransferReversed(event.data);
    }
  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }
});

async function handleChargeSuccess(data) {
  const reference = data.reference;
  
  const orders = await Order.find({ paymentReference: reference });
  if (orders.length === 0) {
    console.warn('charge.success: orders not found for reference:', reference);
    return;
  }

  for (const order of orders) {
    if (order.isPaid) {
      console.log('charge.success: order already paid:', order._id);
      continue;
    }

    order.isPaid = true;
    order.paymentStatus = 'Paid';
    order.status = 'Processing';
    order.paidAt = new Date();
    await order.save();

    await Escrow.update(
      { status: 'HELD', paystack_reference: reference },
      { where: { order_id: order._id.toString() } }
    );

    console.log('charge.success: order marked as paid:', order._id, 'Amount:', data.amount / 100);
  }
}

async function handleTransferSuccess(data) {
  const transferCode = data.transfer_code;
  console.log('transfer.success:', transferCode);
}

async function handleTransferFailed(data) {
  const transferCode = data.transfer_code;
  console.error('transfer.failed:', transferCode);
}

async function handleTransferReversed(data) {
  const transferCode = data.transfer_code;
  console.warn('transfer.reversed:', transferCode);
}

export default router;