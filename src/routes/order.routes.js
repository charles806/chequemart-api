import { Router } from 'express';
import { 
  createOrder, 
  getMyOrders, 
  getOrderById, 
  cancelOrder,
  confirmOrder,
  markReceived,
  updateOrderStatus,
  initializePayment
} from '../controllers/order.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

// All order routes require authentication
router.use(protect);

router.post('/', createOrder);
router.post('/initialize-payment', initializePayment);
router.get('/', getMyOrders);
router.get('/:id', getOrderById);
router.patch('/:id/cancel', cancelOrder);
router.patch('/:id/confirm', confirmOrder);
router.patch('/:id/receive', markReceived);
router.patch('/:id/status', updateOrderStatus);

export default router;
