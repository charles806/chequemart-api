import mongoose from "mongoose";

const { Schema, model } = mongoose;

const SupportTicketSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    adminNotes: {
      type: String,
    },
  },
  { timestamps: true }
);

SupportTicketSchema.index({ status: 1 });
SupportTicketSchema.index({ email: 1 });

export default model("SupportTicket", SupportTicketSchema);
