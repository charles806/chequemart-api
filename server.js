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
  try {
    await connectDB();
    await connectPostgres();

    if (process.env.VERCEL) {
      console.log("🚀 Running in Vercel environment");
      return;
    }

    const server = app.listen(PORT, () => {
      console.log(`🚀 Chequemart API running on port ${PORT}`);
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
      if (typeof server !== 'undefined') server.close(() => process.exit(1));
      else process.exit(1);
    });
  } catch (error) {
    console.error("❌ Startup Error:", error.message);
  }
};

startServer();

export default app;