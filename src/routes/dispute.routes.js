import { Router } from 'express';
import { 
  createDispute,
  getMyDisputes,
  getDisputeById,
  getSellerDisputes,
  respondToDispute,
  resolveDispute,
  getAllDisputes
} from '../controllers/dispute.controller.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';

const router = Router();

// All dispute routes are protected
router.use(protect);

// Buyer routes
router.post('/', restrictTo('buyer'), createDispute);
router.get('/', restrictTo('buyer'), getMyDisputes);
router.get('/:id', getDisputeById);

// Seller routes
router.get('/seller', restrictTo('seller'), getSellerDisputes);
router.post('/:id/respond', restrictTo('seller'), respondToDispute);

// Admin routes
router.get('/admin/all', restrictTo('admin'), getAllDisputes);
router.patch('/:id/resolve', restrictTo('admin'), resolveDispute);

export default router;