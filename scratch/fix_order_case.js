import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "../src/models/Order.model.js";

dotenv.config();

const fixOrderCase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const result = await Order.updateMany(
      { status: "Pending" },
      { $set: { status: "pending" } }
    );
    console.log("Updated status count:", result.modifiedCount);

    const result2 = await Order.updateMany(
      { paymentStatus: "Pending" },
      { $set: { paymentStatus: "pending" } }
    );
    console.log("Updated paymentStatus count:", result2.modifiedCount);

    await mongoose.connection.close();
  } catch (error) {
    console.error("Error:", error);
  }
};

fixOrderCase();
