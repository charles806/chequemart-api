import pkg from "sequelize";
const { DataTypes } = pkg;
import { sequelize } from "../config/postgres.js";

const Escrow = sequelize.define("Escrow", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  order_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "MongoDB ObjectId of the Order",
  },
  buyer_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "MongoDB ObjectId of the Buyer",
  },
  seller_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "MongoDB ObjectId of the Seller",
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  commission: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  seller_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM("HELD", "RELEASED", "REFUNDED"),
    defaultValue: "HELD",
    allowNull: false,
  },
  paystack_reference: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: "escrow",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at"
});

export default Escrow;
