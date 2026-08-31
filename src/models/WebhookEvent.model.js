import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    eventType: {
      type: String,
      required: true,
      maxlength: [100, "Event type cannot exceed 100 characters"],
    },
    reference: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["processed", "failed"],
      default: "processed",
    },
    processedAt: {
      type: Date,
      default: Date.now,
      expires: 86400,
    },
  },
  { timestamps: true }
);

// Idempotency check (eventId + status) and reference dedupe lookups
webhookEventSchema.index({ eventId: 1, status: 1 });
webhookEventSchema.index({ reference: 1 });

const WebhookEvent = mongoose.model("WebhookEvent", webhookEventSchema);

export default WebhookEvent;
