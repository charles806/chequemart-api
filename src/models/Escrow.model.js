import pkg from "sequelize";
const { DataTypes } = pkg;
import { sequelize } from "../config/postgres.js";
import { validateEscrowTransition } from "../utils/escrowTransitions.js";

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
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  commission: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  seller_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM("HELD", "RELEASED", "REFUNDED", "DISPUTED", "AUTO_RELEASED", "EXPIRED"),
    defaultValue: "HELD",
    allowNull: false,
  },
  paystack_reference: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: "escrow",
  indexes: [
    { fields: ['order_id'] },
    { fields: ['seller_id'] },
    { fields: ['status'] },
  ],
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
  hooks: {
    beforeUpdate: (escrow, options) => {
      if (escrow.changed("status")) {
        const previousStatus = escrow._previousDataValues.status;
        const newStatus = escrow.status;
        const { valid, message } = validateEscrowTransition(previousStatus, newStatus);
        if (!valid) {
          throw new Error(message);
        }
      }
    },
  },
});

export default Escrow;
