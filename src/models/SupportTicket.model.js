import mongoose from "mongoose";
import validator from "validator";

const { Schema, model } = mongoose;
const { isEmail } = validator;

const SupportTicketSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => isEmail(v),
        message: "Invalid email address",
      },
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, "Subject cannot exceed 200 characters"],
    },
    message: {
      type: String,
      required: true,
      maxlength: [2000, "Message cannot exceed 2000 characters"],
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    adminNotes: {
      type: String,
      maxlength: [2000, "Admin notes cannot exceed 2000 characters"],
    },
  },
  { timestamps: true }
);

SupportTicketSchema.index({ status: 1 });
SupportTicketSchema.index({ email: 1 });
SupportTicketSchema.index({ user: 1, createdAt: -1 });

export default model("SupportTicket", SupportTicketSchema);
