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
      price: {
        type: Number,
        min: [0, "Price cannot be negative"],
      },
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
    min: [0, "Total amount cannot be negative"],
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'collected', 'cancelled'],
    default: 'pending',
  },
  trackingNumber: {
    type: String,
    default: null,
    maxlength: [100, "Tracking number cannot exceed 100 characters"],
    trim: true,
  },
  carrier: {
    type: String,
    default: null,
    maxlength: [50, "Carrier name cannot exceed 50 characters"],
    trim: true,
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
    enum: ['pending', 'paid', 'unpaid', 'refunded', 'failed'],
    default: 'pending',
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
    sparse: true,
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
orderSchema.index({ seller: 1, status: 1 });
orderSchema.index({ escrowId: 1 });

const Order = mongoose.model('Order', orderSchema);

export default Order;