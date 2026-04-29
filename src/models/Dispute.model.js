import pkg from "sequelize";
const { DataTypes } = pkg;
import { sequelize } from "../config/postgres.js";

const Dispute = sequelize.define("Dispute", {
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
  reason: {
    type: DataTypes.ENUM(
      "not_received",
      "damaged",
      "wrong_item",
      "not_as_described",
      " counterfeit",
      "other"
    ),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  evidence_urls: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
  },
  status: {
    type: DataTypes.ENUM("OPEN", "UNDER_REVIEW", "RESOLVED", "CLOSED"),
    defaultValue: "OPEN",
    allowNull: false,
  },
  resolution: {
    type: DataTypes.ENUM("REFUND_BUYER", "RELEASE_ESCROW", "CANCEL_DISPUTE"),
    allowNull: true,
  },
  admin_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: "disputes",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});

export default Dispute;