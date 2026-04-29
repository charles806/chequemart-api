import mongoose from "mongoose";

const { Schema, model } = mongoose;

const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      minlength: [2, "Product name must be at least 2 characters"],
      maxlength: [100, "Product name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Price cannot be negative"],
    },
    discountPrice: {
      type: Number,
      min: [0, "Discount price cannot be negative"],
      validate: {
        validator: function (v) {
          return !v || v < this.price;
        },
        message: "Discount price must be less than regular price",
      },
    },
    category: {
      type: String,
      required: [true, "Product category is required"],
    },
    images: {
      type: [String],
      default: [],
    },
    condition: {
      type: String,
      enum: ["Brand New", "Like New", "Fairly Used", "Refurbished"],
      default: "Brand New",
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, "Stock cannot be negative"],
    },
    sku: {
      type: String,
      unique: true,
      sparse: true,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Seller is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
specifications: {
      type: Schema.Types.Mixed,
      default: {},
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: [0, "Delivery fee cannot be negative"],
      comment: "Fixed delivery fee for this product (separate from shipping)"
    },
    variants: {
      type: [{
        name: String,
        value: String,
        priceAdjustment: {
          type: Number,
          default: 0
        },
        stock: {
          type: Number,
          default: 0
        }
      }],
      default: [],
      comment: "Product variants (e.g., Size: L, Color: Red)"
    },
  },
  {
    timestamps: true
  }
);

ProductSchema.index({ category: 1 });
ProductSchema.index({ seller: 1 });
ProductSchema.index({ isActive: 1 });
ProductSchema.index({ isFeatured: 1 });
ProductSchema.index({ name: "text", description: "text" });

export default model("Product", ProductSchema);
