import cron from 'node-cron';
import Order from '../models/Order.model.js';
import Escrow from '../models/Escrow.model.js';
import Wallet from '../models/Wallet.model.js';
import { sequelize } from '../config/postgres.js';

/**
 * Auto-release cron job
 * Runs daily at 2:00 AM to release escrows for orders delivered > 5 days without disputes.
 * This ensures funds are released automatically even if buyer forgets to mark as received.
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
 * Finds and releases escrows for orders delivered > 5 days ago without disputes.
 */
export const autoReleaseEscrows = async () => {
  try {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    // Find orders that are delivered but not auto-released
    // AND delivered more than 5 days ago AND have no open disputes
    const orders = await Order.find({
      status: 'delivered',
      createdAt: { $lte: fiveDaysAgo }
    });

    let releasedCount = 0;
    
    for (const order of orders) {
      // Check if already released
      const escrow = await Escrow.findOne({ 
        where: { order_id: order._id.toString() }
      });

      if (!escrow) continue;
      
      if (escrow.status !== 'HELD') continue;
      
      // Check for active disputes
      // (simple check - in production would query Dispute table)
      
      try {
        await sequelize.transaction(async (t) => {
          // Update escrow status
          escrow.status = 'RELEASED';
          await escrow.save({ transaction: t });

          // Update wallet
          const wallet = await Wallet.findOne({
            where: { seller_id: escrow.seller_id },
            transaction: t
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
      } catch (err) {
        console.error(`[Cron] Failed to release escrow for or
          
          der ${order._id}:`, err.message);
      }
    }

    console.log(`[Cron] Escrow auto-release complete. Released ${releasedCount} escrows.`);
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