import { Router } from 'express';
import { 
  getDashboardSummary, 
  getRevenueAnalytics, 
  getSellerOrders,
  updateOrderStatus,
  getWallet,
  getTransactions,
  getBankAccounts,
  addBankAccount,
  deleteBankAccount,
  getEscrowSummary,
  getSellerEscrows,
  requestWithdrawal,
  getWithdrawals
} from '../controllers/seller.controller.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';

const router = Router();

// All seller routes are protected and restricted to sellers
router.use(protect);
router.use(restrictTo('seller', 'admin'));

router.get('/wallet', getWallet);
router.get('/wallet/transactions', getTransactions);
router.get('/bank-accounts', getBankAccounts);
router.post('/bank-accounts', addBankAccount);
router.delete('/bank-accounts/:id', deleteBankAccount);
router.get('/escrow/summary', getEscrowSummary);
router.get('/escrow', getSellerEscrows);
router.get('/analytics/summary', getDashboardSummary);
router.get('/analytics/revenue', getRevenueAnalytics);
router.get('/orders', getSellerOrders);
router.put('/orders/:id/status', updateOrderStatus);
router.post('/withdraw', requestWithdrawal);
router.get('/withdrawals', getWithdrawals);

export default router;
