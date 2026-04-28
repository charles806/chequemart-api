/**
 * Notification Helper
 * Placeholders for sending Email/SMS/In-app notifications
 */

export const sendStatusNotification = async (order, previousStatus) => {
  const { status, buyer, seller, _id } = order;
  
  console.log(`[Notification] Order ${_id}: ${previousStatus} -> ${status}`);
  
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
  }
};
