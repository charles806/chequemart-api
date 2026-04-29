/**
 * Notification Helper
 * Sends Email/SMS/In-app notifications using configured providers
 */
import User from '../models/User.model.js';
import { sendEmail } from './email.utils.js';

export const sendStatusNotification = async (order, previousStatus) => {
  const { status, buyer, seller, _id } = order;
  
  console.log(`[Notification] Order ${_id}: ${previousStatus} -> ${status}`);
  
  try {
    const buyerUser = await User.findById(buyer);
    const sellerUser = await User.findById(seller);

    switch (status) {
      case 'processing':
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
        if (sellerUser?.email) {
          await sendEmail({
            to: sellerUser.email,
            subject: `💰 Order Delivered - Funds Released - Order #${_id}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #333;">Order Delivered!</h2>
                <p>The buyer has confirmed receipt of the order.</p>
                <p><strong>Order ID:</strong> ${_id}</p>
                <p><strong>Amount released:</strong> ₦${order.sellerAmount}</p>
                <p>Funds have been released to your wallet.</p>
              </div>
            `
          });
        }
        break;
        
      case 'cancelled':
        if (buyerUser?.email) {
          await sendEmail({
            to: buyerUser.email,
            subject: `❌ Order Cancelled - Order #${_id}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #333;">Order Cancelled</h2>
                <p>Your order has been cancelled.</p>
                <p><strong>Order ID:</strong> ${_id}</p>
                <p>Refunds will be processed within 5-7 business days.</p>
              </div>
            `
          });
        }
        break;
        
      default:
        break;
    }
  } catch (error) {
    console.warn('[Notification] Failed to send email:', error.message);
  }
};