import pkg from "sequelize";
const { DataTypes } = pkg;
import { sequelize } from "../config/postgres.js";

const BankDetail = sequelize.define("BankDetail", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  seller_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  bank_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  bank_code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  account_number: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  account_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  recipient_code: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: "seller_bank_accounts",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});

export default BankDetail;
