import { Router } from 'express';
import { 
  createOrder, 
  getMyOrders, 
  getOrderById, 
  cancelOrder,
  confirmOrder,
  markCollected,
  updateOrderStatus,
  initializePayment,
  verifyPayment
} from '../controllers/order.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { createOrderValidation, validate } from '../middleware/validation.middleware.js';

const router = Router();

// All order routes require authentication
router.use(protect);

router.post('/', createOrderValidation, validate, createOrder);
router.post('/initialize-payment', initializePayment);
router.get('/verify/:reference', verifyPayment);
router.get('/', getMyOrders);
router.get('/:id', getOrderById);
router.patch('/:id/cancel', cancelOrder);
router.patch('/:id/confirm', confirmOrder);
router.patch('/:id/collect', markCollected);
router.patch('/:id/status', updateOrderStatus);

export default router;
