import mongoose from "mongoose";

const { connect, connection } = mongoose;

const connectDB = async () => {
  try {
    const conn = await connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected`);

    // Optional: apply native $jsonSchema validation on boot.
    // Enable with APPLY_SCHEMA_VALIDATION=true. Collections whose existing
    // docs violate a schema are skipped (and reported) rather than breaking boot.
    if (process.env.APPLY_SCHEMA_VALIDATION === "true") {
      try {
        const { apply } = await import("./scripts/apply-mongo-validation.js");
        const code = await apply(connection);
        if (code !== 0) {
          console.error("Schema validation apply reported problems (see above).");
        } else {
          console.log("Schema validation applied to all collections.");
        }
      } catch (err) {
        console.error("Schema validation apply failed:", err.message);
      }
    }
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
