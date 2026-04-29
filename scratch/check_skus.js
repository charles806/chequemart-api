import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../src/models/Product.model.js";

dotenv.config();

const checkProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const products = await Product.find({}, "name sku");
    console.log("Current Products:", products);

    await mongoose.connection.close();
  } catch (error) {
    console.error("Error:", error);
  }
};

checkProducts();
