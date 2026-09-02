import 'dotenv/config';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import { connectPostgres } from './src/config/postgres.js';
import './src/models/Escrow.model.js';
import './src/models/EscrowEvent.model.js';
import './src/models/Wallet.model.js';
import './src/models/Withdrawal.model.js';
import './src/models/Dispute.model.js';
import { startEscrowAutoReleaseJob } from './src/utils/cron.js';
import logger from './src/utils/logger.js';

const PORT = process.env.PORT;

const REQUIRED_ENV_VARS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MONGO_URI',
  'POSTGRES_URI',
  'PAYSTACK_SECRET_KEY',
  'PAYSTACK_PUBLIC_KEY',
  'CLIENT_URL',
];

const checkEnvVars = () => {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error({ missing }, 'Missing required environment variables');
    process.exit(1);
  }

  if (!process.env.SMTP_USER) logger.warn('SMTP_USER not set — emails will not send');
  if (!process.env.SMTP_PASS) logger.warn('SMTP_PASS not set — emails will not send');
  if (!process.env.ADMIN_EMAIL) logger.warn('ADMIN_EMAIL not set — dispute notifications will be skipped');

  logger.info('Environment variables validated');
};

const startServer = async () => {
  try {
    checkEnvVars();

    connectDB().catch((err) => logger.warn({ err }, 'MongoDB connection failed'));
    await connectPostgres().catch((err) => logger.warn({ err }, 'PostgreSQL connection failed'));

    if (!process.env.VERCEL) {
      startEscrowAutoReleaseJob();
    }

    if (process.env.VERCEL) {
      logger.info('Running in Vercel environment');
      return;
    }

    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, `Chequemart API running on port ${PORT}`);
    });

    const shutdown = (signal) => {
      logger.info({ signal }, 'Received shutdown signal. Shutting down gracefully...');
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (err) => {
      logger.error({ err }, 'Unhandled Promise Rejection');
      if (typeof server !== 'undefined') server.close(() => process.exit(1));
      else process.exit(1);
    });
  } catch (error) {
    logger.error({ err: error }, 'Startup Error');
  }
};

// ─────────────────────────────────────────
// Serverless (Vercel) path
// ─────────────────────────────────────────
// On Vercel the runtime imports this module and calls the exported `app`
// directly per-request. We must NOT let startup side effects (env checks that
// process.exit, blocking DB connects, app.listen) crash the function or delay
// cold starts. Kick off DB connections lazily in the background and hand the
// request handler straight back.
if (!process.env.VERCEL) {
  startServer();
} else {
  logger.info('Running in Vercel environment');
  connectDB().catch((err) => logger.warn({ err }, 'MongoDB connection failed (lazy)'));
  connectPostgres().catch((err) => logger.warn({ err }, 'PostgreSQL connection failed (lazy)'));
}

export default app;