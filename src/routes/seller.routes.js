import { Router } from 'express';
import { 
  getDashboardSummary, 
  getRevenueAnalytics, 
  getSellerOrders,
  updateOrderStatus,
  getWallet,
  getTransactions,
  getBankAccounts,
  getEscrowSummary,
  getSellerEscrows
} from '../controllers/seller.controller.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';

const router = Router();

// All seller routes are protected and restricted to sellers
router.use(protect);
router.use(restrictTo('seller', 'admin'));

router.get('/wallet', getWallet);
router.get('/wallet/transactions', getTransactions);
router.get('/bank-accounts', getBankAccounts);
router.get('/escrow/summary', getEscrowSummary);
router.get('/escrow', getSellerEscrows);
router.get('/analytics/summary', getDashboardSummary);
router.get('/analytics/revenue', getRevenueAnalytics);
router.get('/orders', getSellerOrders);
router.put('/orders/:id/status', updateOrderStatus);

export default router;
