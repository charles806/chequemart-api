import pkg from "sequelize";
const { DataTypes } = pkg;
import { sequelize } from "../config/postgres.js";

const Transaction = sequelize.define("Transaction", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  seller_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM("CREDIT", "DEBIT"),
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM("PENDING", "SUCCESS", "FAILED"),
    defaultValue: "PENDING",
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: "seller_transactions",
  indexes: [
    { fields: ['seller_id'] },
    { fields: ['created_at'] },
  ],
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});

export default Transaction;
