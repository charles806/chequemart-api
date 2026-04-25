import pkg from "sequelize";
const { DataTypes } = pkg;
import { sequelize } from "../config/postgres.js";
import Escrow from "./Escrow.model.js";

const EscrowEvent = sequelize.define("EscrowEvent", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  escrow_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Escrow,
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  event_type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "e.g. CREATED, RELEASE_REQUESTED, DISPUTED, RELEASED, REFUNDED",
  },
  triggered_by: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "MongoDB ObjectId of the User/Admin or 'SYSTEM'",
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
}, {
  tableName: "escrow_events",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: false // PRD specifies created_at only
});

// Setup relationships
Escrow.hasMany(EscrowEvent, { foreignKey: 'escrow_id', as: 'events' });
EscrowEvent.belongsTo(Escrow, { foreignKey: 'escrow_id', as: 'escrow' });

export default EscrowEvent;
