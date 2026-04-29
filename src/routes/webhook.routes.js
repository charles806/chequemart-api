import express from 'express';
import crypto from 'crypto';
import Order from '../models/Order.model.js';
import Escrow from '../models/Escrow.model.js';
import User from '../models/User.model.js';
<<<<<<< HEAD

const router = express.Router();

=======
import { sequelize } from '../config/postgres.js';
import Wallet from '../models/Wallet.model.js';
import Withdrawal from '../models/Withdrawal.model.js';

const router = express.Router();

// verifyPaystackSignature validates the Paystack webhook signature using raw buffer
// Using raw body instead of JSON.stringify ensures consistent hashing for production
>>>>>>> cba3093 (Clean: remove Stripe secret completely)
function verifyPaystackSignature(req, res, next) {
  const signature = req.headers['x-paystack-signature'];
  if (!signature) {
    console.warn('Webhook received without signature');
    return res.status(401).send('No signature');
  }

<<<<<<< HEAD
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
=======
  // Use raw buffer for consistent hashing - this is required for production
  // The raw body is available as req.body (Buffer) when using express.raw()
  const payload = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
  
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(payload)
>>>>>>> cba3093 (Clean: remove Stripe secret completely)
    .digest('hex');

  if (hash !== signature) {
    console.warn('Webhook signature mismatch');
    return res.status(401).send('Invalid signature');
  }
  next();
}

router.post('/paystack', verifyPaystackSignature, async (req, res) => {
  res.sendStatus(200);

<<<<<<< HEAD
  const event = req.body;
=======
  // Parse the raw body to JSON
  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(req.body);
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (parseErr) {
    console.error('Failed to parse webhook payload:', parseErr.message);
    return;
  }

>>>>>>> cba3093 (Clean: remove Stripe secret completely)
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
<<<<<<< HEAD
    order.paymentStatus = 'Paid';
    order.status = 'Processing';
    order.paidAt = new Date();
    await order.save();

=======
    order.paymentStatus = 'paid';
    order.status = 'processing';
    order.paidAt = new Date();
    await order.save();

    // Update escrow status to HELD
>>>>>>> cba3093 (Clean: remove Stripe secret completely)
    await Escrow.update(
      { status: 'HELD', paystack_reference: reference },
      { where: { order_id: order._id.toString() } }
    );

<<<<<<< HEAD
=======
    // Credit seller's pending_balance (funds held until delivery)
    const sellerId = order.seller.toString();
    try {
      await sequelize.transaction(async (t) => {
        let wallet = await Wallet.findOne({ where: { seller_id: sellerId }, transaction: t });
        
        if (!wallet) {
          // Create wallet if doesn't exist
          wallet = await Wallet.create({
            seller_id: sellerId,
            available_balance: 0,
            pending_balance: 0,
            total_earned: 0
          }, { transaction: t });
        }

        // Get escrow to find seller amount
        const escrow = await Escrow.findOne({ 
          where: { order_id: order._id.toString() },
          transaction: t
        });
        
        if (escrow) {
          const sellerAmount = parseFloat(escrow.seller_amount);
          wallet.pending_balance = parseFloat(wallet.pending_balance) + sellerAmount;
          await wallet.save({ transaction: t });
          console.log(`[Wallet] Credited ${sellerAmount} to seller ${sellerId} pending balance`);
        }
      });
    } catch (walletError) {
      console.error('Failed to credit seller wallet:', walletError.message);
    }

>>>>>>> cba3093 (Clean: remove Stripe secret completely)
    console.log('charge.success: order marked as paid:', order._id, 'Amount:', data.amount / 100);
  }
}

async function handleTransferSuccess(data) {
  const transferCode = data.transfer_code;
  console.log('transfer.success:', transferCode);
<<<<<<< HEAD
=======

  // Find withdrawal by transfer code and update status
  try {
    const withdrawal = await Withdrawal.findOne({ 
      where: { paystack_transfer_id: transferCode }
    });
    
    if (withdrawal) {
      withdrawal.status = 'SUCCESS';
      await withdrawal.save();
      console.log(`[Withdrawal] Marked as SUCCESS: ${withdrawal.id}`);
    }
  } catch (err) {
    console.error('Failed to update withdrawal status:', err.message);
  }
>>>>>>> cba3093 (Clean: remove Stripe secret completely)
}

async function handleTransferFailed(data) {
  const transferCode = data.transfer_code;
  console.error('transfer.failed:', transferCode);
<<<<<<< HEAD
=======

  // Find withdrawal by transfer code and handle failure
  try {
    const withdrawal = await Withdrawal.findOne({ 
      where: { paystack_transfer_id: transferCode }
    });
    
    if (withdrawal) {
      // Rollback the balance to available
      await sequelize.transaction(async (t) => {
        const wallet = await Wallet.findOne({ 
          where: { seller_id: withdrawal.seller_id }, 
          transaction: t 
        });
        if (wallet) {
          wallet.available_balance = parseFloat(wallet.available_balance) + parseFloat(withdrawal.amount);
          await wallet.save({ transaction: t });
        }
      });

      withdrawal.status = 'FAILED';
      await withdrawal.save();
      console.log(`[Withdrawal] Marked as FAILED and balance restored: ${withdrawal.id}`);
    }
  } catch (err) {
    console.error('Failed to handle transfer failure:', err.message);
  }
>>>>>>> cba3093 (Clean: remove Stripe secret completely)
}

async function handleTransferReversed(data) {
  const transferCode = data.transfer_code;
  console.warn('transfer.reversed:', transferCode);
}

export default router;