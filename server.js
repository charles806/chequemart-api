import "dotenv/config";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { connectPostgres } from "./src/config/postgres.js";
import "./src/models/Escrow.model.js";
import "./src/models/EscrowEvent.model.js";
import "./src/models/Wallet.model.js";
import "./src/models/Withdrawal.model.js";

const PORT = process.env.PORT;

const startServer = async () => {
  await connectDB();
  await connectPostgres();

  const server = app.listen(PORT, () => {
    console.log(`🚀 Chequemart API running on port ${PORT}`);;
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  });

  //  Graceful Shutdown 
  const shutdown = (signal) => {
    console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log("✅ HTTP server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (err) => {
    console.error("❌ Unhandled Promise Rejection:", err.message);
    server.close(() => process.exit(1));
  });
};

startServer();