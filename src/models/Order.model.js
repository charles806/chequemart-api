import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  products: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
      },
      name: String,
      price: Number,
      quantity: {
        type: Number,
        default: 1,
      },
      image: String,
    }
  ],
  totalAmount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'processing', 'confirmed', 'shipped', 'delivered', 'collected', 'cancelled'],
    default: 'Pending',
  },
  trackingNumber: {
    type: String,
    default: null,
  },
  carrier: {
    type: String,
    default: null,
  },
  trackingHistory: [
    {
      status: String,
      description: String,
      timestamp: { type: Date, default: Date.now },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  ],
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Unpaid', 'Refunded'],
    default: 'Pending',
  },
  shippingAddress: {
    fullName: String,
    address: String,
    city: String,
    state: String,
    phone: String,
  },
  escrowId: {
    type: String,
  },
  paymentReference: {
    type: String,
  },
  isPaid: {
    type: Boolean,
    default: false,
  },
  paidAt: {
    type: Date,
  }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

export default Order;