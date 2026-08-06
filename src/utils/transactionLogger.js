import Transaction from '../models/Transaction.model.js';

export const logTransaction = async ({ type, amount, sellerId, orderId, escrowId, reference, description, status = 'SUCCESS', metadata = {} }) => {
  try {
    await Transaction.create({
      seller_id: sellerId,
      amount,
      type,
      description,
      status,
      reference,
    });
  } catch (error) {
    console.error('Failed to log transaction:', error.message);
  }
};
