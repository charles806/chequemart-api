import "dotenv/config";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { connectPostgres } from "./src/config/postgres.js";
import "./src/models/Escrow.model.js";
import "./src/models/EscrowEvent.model.js";
import "./src/models/Wallet.model.js";
import "./src/models/Withdrawal.model.js";
import "./src/models/Dispute.model.js";
import { startEscrowAutoReleaseJob } from "./src/utils/cron.js";

const PORT = process.env.PORT;

// Startup check for required environment variables
// Warns immediately so Charles knows what's missing
const checkEnvVars = () => {
  const missing = [];
  
  if (!process.env.SMTP_USER) missing.push("SMTP_USER");
  if (!process.env.SMTP_PASS) missing.push("SMTP_PASS");
  if (!process.env.ADMIN_EMAIL) {
    console.warn("⚠️ ADMIN_EMAIL not set - dispute notifications will be skipped");
  }
  
  if (missing.length > 0) {
    console.error("❌ Missing required env vars:", missing.join(", "));
    console.error("📝 Add these to your .env file:");
    console.error("   SMTP_USER=your_email@gmail.com");
    console.error("   SMTP_PASS=your_16_char_app_password");
    console.error("   ADMIN_EMAIL=admin@yourdomain.com");
  } else {
    console.log("✅ Email configuration complete");
  }
};

const startServer = async () => {
  try {
    // Check env vars first
    checkEnvVars();
    
    // Connect to DBs without blocking startup
    connectDB().catch(err => console.warn("⚠️ MongoDB:", err.message));
    await connectPostgres().catch(err => console.warn("⚠️ PostgreSQL:", err.message));

    // Start cron jobs after DB connection
    startEscrowAutoReleaseJob();

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