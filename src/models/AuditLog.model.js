import mongoose from "mongoose";

const { Schema, model } = mongoose;

const AuditLogSchema = new Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
      maxlength: [100, "Action cannot exceed 100 characters"],
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetId: {
      type: String,
    },
    targetType: {
      type: String,
      maxlength: [50, "Target type cannot exceed 50 characters"],
    },
    changes: {
      type: Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });

export default model("AuditLog", AuditLogSchema);
