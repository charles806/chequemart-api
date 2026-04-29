/**
 * Notification Helper
<<<<<<< HEAD
 * Placeholders for sending Email/SMS/In-app notifications
 */

=======
 * Sends Email/SMS/In-app notifications using configured providers
 */
import User from '../models/User.model.js';
import { sendEmail } from './email.utils.js';

// sendStatusNotification sends email notifications based on order status changes
// This replaces console.log with real email sending via SMTP/Resend
>>>>>>> cba3093 (Clean: remove Stripe secret completely)
export const sendStatusNotification = async (order, previousStatus) => {
  const { status, buyer, seller, _id } = order;
  
  console.log(`[Notification] Order ${_id}: ${previousStatus} -> ${status}`);
  
<<<<<<< HEAD
  // Logic based on status
  switch (status) {
    case 'processing':
      // Notify seller of new paid order
      console.log(`- Notifying Seller (${seller}) of new paid order.`);
      break;
    case 'confirmed':
      // Notify buyer that order is confirmed
      console.log(`- Notifying Buyer (${buyer}) that order is confirmed and will be shipped soon.`);
      break;
    case 'shipped':
      // Notify buyer with tracking info
      console.log(`- Notifying Buyer (${buyer}) that order has been shipped.`);
      break;
    case 'delivered':
      // Notify seller that funds will be released
      console.log(`- Notifying Seller (${seller}) that buyer has received the product.`);
      break;
    case 'cancelled':
      // Notify parties of cancellation
      console.log(`- Notifying parties of cancellation.`);
      break;
    default:
      break;
=======
  try {
    // Fetch buyer and seller details
    const buyerUser = await User.findById(buyer);
    const sellerUser = await User.findById(seller);

    // Logic based on status
    switch (status) {
      case 'processing':
        // Notify seller of new paid order
        if (sellerUser?.email) {
          await sendEmail({
            to: sellerUser.email,
            subject: `🔔 New Order Received - Order #${_id}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #333;">New Order Received!</h2>
                <p>You have a new paid order on Chequemart.</p>
                <p><strong>Order ID:</strong> ${_id}</p>
                <p><strong>Amount:</strong> ₦${order.totalAmount}</p>
                <p>Please process and ship the order as soon as possible.</p>
              </div>
            `
          });
        }
        break;
        
      case 'confirmed':
        // Notify buyer that order is confirmed
        if (buyerUser?.email) {
          await sendEmail({
            to: buyerUser.email,
            subject: `✅ Order Confirmed - Order #${_id}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #333;">Order Confirmed!</h2>
                <p>Your order has been confirmed and will be shipped soon.</p>
                <p><strong>Order ID:</strong> ${_id}</p>
                <p><strong>Amount:</strong> ₦${order.totalAmount}</p>
              </div>
            `
          });
        }
        break;
        
      case 'shipped':
        // Notify buyer with tracking info
        if (buyerUser?.email) {
          await sendEmail({
            to: buyerUser.email,
            subject: `📦 Order Shipped - Order #${_id}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #333;">Your Order Has Been Shipped!</h2>
                <p>Your order is on its way.</p>
                <p><strong>Order ID:</strong> ${_id}</p>
                ${order.trackingNumber ? `<p><strong>Tracking:</strong> ${order.trackingNumber}</p>` : ''}
                ${order.carrier ? `<p><strong>Carrier:</strong> ${order.carrier}</p>` : ''}
              </div>
            `
          });
        }
        break;
        
      case 'delivered':
        // Notify seller that funds will be released
        if (sellerUser?.email) {
          await sendEmail({
            to: sellerUser.email,
            subject: `💰 Order Delivered - Funds Released - Order #${_id}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #333;">Order Delivered!</h2>
                <p>The buyer has confirmed receipt of the order.</p>
                <p>Your funds have been released to your wallet.</p>
                <p><strong>Order ID:</strong> ${_id}</p>
              </div>
            `
          });
        }
        break;
        
      case 'cancelled':
        // Notify parties of cancellation
        if (buyerUser?.email) {
          await sendEmail({
            to: buyerUser.email,
            subject: `❌ Order Cancelled - Order #${_id}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #333;">Order Cancelled</h2>
                <p>Your order has been cancelled.</p>
                <p><strong>Order ID:</strong> ${_id}</p>
                <p>If you paid, a refund will be processed automatically.</p>
              </div>
            `
          });
        }
        if (sellerUser?.email) {
          await sendEmail({
            to: sellerUser.email,
            subject: `❌ Order Cancelled - Order #${_id}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #333;">Order Cancelled</h2>
                <p>An order has been cancelled.</p>
                <p><strong>Order ID:</strong> ${_id}</p>
              </div>
            `
          });
        }
        break;
        
      default:
        break;
    }
  } catch (error) {
    // Log error but don't fail the main flow
    console.error('[Notification] Failed to send email:', error.message);
  }
};

/**
 * sendDisputeNotification notifies relevant parties of a new dispute
 */
export const sendDisputeNotification = async (dispute, order) => {
  try {
    const sellerUser = await User.findById(dispute.seller_id);
    const adminEmail = process.env.ADMIN_EMAIL;
    
    // Notify seller
    if (sellerUser?.email) {
      await sendEmail({
        to: sellerUser.email,
        subject: `⚠️ Dispute Raised - Order #${dispute.order_id}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
            <h2 style="color: #dc2626;">Dispute Raised</h2>
            <p>A buyer has raised a dispute for your order.</p>
            <p><strong>Reason:</strong> ${dispute.reason}</p>
            <p><strong>Description:</strong> ${dispute.description}</p>
            <p>Please respond to the dispute in your dashboard.</p>
          </div>
        `
      });
    }
    
    // Notify admin
    if (adminEmail) {
      await sendEmail({
        to: adminEmail,
        subject: `⚠️ New Dispute - Order #${dispute.order_id}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
            <h2 style="color: #dc2626;">New Dispute</h2>
            <p>A new dispute requires your attention.</p>
            <p><strong>Order ID:</strong> ${dispute.order_id}</p>
            <p><strong>Reason:</strong> ${dispute.reason}</p>
          </div>
        `
      });
    }
  } catch (error) {
    console.error('[Notification] Failed to send dispute notification:', error.message);
>>>>>>> cba3093 (Clean: remove Stripe secret completely)
  }
};
