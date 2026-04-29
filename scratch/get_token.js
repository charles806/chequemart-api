import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../src/models/User.model.js";

dotenv.config();

const getTestToken = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const user = await User.findOne({ role: "seller" });
    if (!user) {
      console.log("No seller found");
      return;
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_ACCESS_SECRET);
    console.log("TOKEN:", token);
    await mongoose.connection.close();
  } catch (error) {
    console.error(error);
  }
};

getTestToken();
