import pkg from "sequelize";
const { DataTypes } = pkg;
import { sequelize } from "../config/postgres.js";

const Withdrawal = sequelize.define("Withdrawal", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
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
  paystack_transfer_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("PENDING", "SUCCESS", "FAILED"),
    defaultValue: "PENDING",
    allowNull: false,
  },
}, {
  tableName: "withdrawals",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: false // PRD specifies created_at only
});

export default Withdrawal;
