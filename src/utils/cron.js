import cron from 'node-cron';
import Order from '../models/Order.model.js';
import Escrow from '../models/Escrow.model.js';
import EscrowEvent from '../models/EscrowEvent.model.js';
import Wallet from '../models/Wallet.model.js';
import Dispute from '../models/Dispute.model.js';
import { sequelize } from '../config/postgres.js';

// How many days after delivery before escrow is auto-released.
// Confirmed delivery events in trackingHistory determine the start of the window.
const AUTO_RELEASE_DAYS = 5;

// Derive the date the order reached a terminal-delivery state.
// Prefers the trackingHistory entry for 'delivered'/'collected'; falls back to updatedAt.
const deliveredAtOf = (order) => {
  const history = order.trackingHistory || [];
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.status === 'delivered' || entry.status === 'collected') {
      return new Date(entry.timestamp);
    }
  }
  return new Date(order.updatedAt);
};

/**
 * Auto-release cron job
 * Runs daily at 2:00 AM to release escrows for orders delivered > 5 days
 * ago without disputes. This ensures funds are released automatically even
 * if the buyer forgets to confirm collection.
 */
export const startEscrowAutoReleaseJob = () => {
  if (!process.env.VERCEL) {
    // Run every day at 2:00 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('[Cron] Starting escrow auto-release job...');
      await autoReleaseEscrows();
    });
    console.log('[Cron] Escrow auto-release job scheduled (runs daily at 2:00 AM)');
  } else {
    console.log('[Cron] Skipping node-cron scheduler (Vercel environment)');
  }
};

/**
 * autoReleaseEscrows
 * Finds and releases escrows for orders at 'delivered' or 'collected' status
 * that reached that state more than AUTO_RELEASE_DAYS ago, with no open dispute.
 */
export const autoReleaseEscrows = async () => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - AUTO_RELEASE_DAYS);

    // Orders at a terminal-delivery state (delivered or collected). We derive
    // the exact delivery timestamp per order via deliveredAtOf() below because
    // the Order model has no dedicated deliveredAt field.
    const orders = await Order.find({
      status: { $in: ['delivered', 'collected'] },
    });

    let releasedCount = 0;
    let skippedYoung = 0;
    let skippedDisputed = 0;

    for (const order of orders) {
      // Never auto-release unpaid orders
      if (!order.isPaid && order.paymentStatus !== 'paid') {
        skippedYoung++;
        continue;
      }

      // Skip orders that reached delivery within the auto-release window
      const deliveredAt = deliveredAtOf(order);
      if (deliveredAt > cutoff) {
        skippedYoung++;
        continue;
      }

      // Look up the matching escrow (PostgreSQL row keyed by Mongo order id)
      const escrow = await Escrow.findOne({
        where: { order_id: order._id.toString() },
      });

      if (!escrow) continue;
      if (escrow.status !== 'HELD') continue;

      // Check for an active dispute — never auto-release while disputed
      const openDispute = await Dispute.findOne({
        where: {
          order_id: order._id.toString(),
          status: ['OPEN', 'UNDER_REVIEW'],
        },
      });
      if (openDispute) {
        skippedDisputed++;
        console.log(`[Cron] Skipping order ${order._id} — open dispute`);
        continue;
      }

      try {
        await sequelize.transaction(async (t) => {
          // Use the dedicated AUTO_RELEASED terminal status (distinct from
          // manual releases so the action is auditable).
          escrow.status = 'AUTO_RELEASED';
          await escrow.save({ transaction: t });

          // Credit the seller's wallet
          const wallet = await Wallet.findOne({
            where: { seller_id: escrow.seller_id },
            transaction: t,
          });

          if (wallet) {
            const sellerAmount = parseFloat(escrow.seller_amount);
            wallet.pending_balance = Math.max(0, parseFloat(wallet.pending_balance) - sellerAmount);
            wallet.available_balance = parseFloat(wallet.available_balance) + sellerAmount;
            wallet.total_earned = parseFloat(wallet.total_earned) + sellerAmount;
            await wallet.save({ transaction: t });
          }
        });

        releasedCount++;
        console.log(`[Cron] Auto-released escrow for order ${order._id}`);

        // Log the event (non-critical, best-effort)
        try {
          await EscrowEvent.create({
            escrow_id: escrow.id,
            event_type: 'AUTO_RELEASED',
            triggered_by: 'SYSTEM',
            metadata: { order_id: order._id.toString(), amount: escrow.seller_amount },
          });
        } catch (eventErr) {
          console.error(`[Cron] Failed to create EscrowEvent for ${order._id}:`, eventErr.message);
        }
      } catch (err) {
        console.error(`[Cron] Failed to release escrow for order ${order._id}:`, err.message);
      }
    }

    console.log(
      `[Cron] Escrow auto-release complete. Released ${releasedCount}, ` +
      `skipped ${skippedYoung} (not eligible), skipped ${skippedDisputed} (disputed).`
    );
  } catch (error) {
    console.error('[Cron] Auto-release job failed:', error.message);
  }
};

/**
 * Manual trigger for auto-release (for testing)
 */
export const triggerManualRelease = async (req, res) => {
  try {
    await autoReleaseEscrows();
    res.json({ success: true, message: 'Manual release triggered' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};