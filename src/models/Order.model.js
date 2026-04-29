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
<<<<<<< HEAD
    enum: ['Pending', 'processing', 'confirmed', 'shipped', 'delivered', 'collected', 'cancelled'],
    default: 'Pending',
=======
    enum: ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'collected', 'cancelled'],
    default: 'pending',
>>>>>>> cba3093 (Clean: remove Stripe secret completely)
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
<<<<<<< HEAD
    enum: ['Pending', 'Paid', 'Unpaid', 'Refunded'],
    default: 'Pending',
=======
    enum: ['pending', 'paid', 'unpaid', 'refunded'],
    default: 'pending',
>>>>>>> cba3093 (Clean: remove Stripe secret completely)
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

// Add indexes for frequently queried fields to improve query performance
orderSchema.index({ buyer: 1, createdAt: -1 });
orderSchema.index({ seller: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ paymentReference: 1 });

const Order = mongoose.model('Order', orderSchema);

export default Order;