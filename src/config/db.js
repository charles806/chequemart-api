import mongoose from "mongoose";

const { connect, connection } = mongoose;

const connectDB = async () => {
  try {
    const conn = await connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

connection.on('connected', () => console.log('Mongoose: connected'));
connection.on('disconnected', () => console.warn('Mongoose: disconnected'));
connection.on('error', (err) => console.error('Mongoose: error', err.message));
connection.on('reconnected', () => console.log('Mongoose: reconnected'));

export default connectDB;
