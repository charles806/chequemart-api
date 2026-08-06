import express, { json, urlencoded, raw } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import mongoSanitize from "express-mongo-sanitize";
import * as Sentry from "@sentry/node";
import "./instrument.js";
import timeout from 'connect-timeout';
import { initialize } from "./config/passport.js";

import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger.js';

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import productRoutes from "./routes/product.routes.js";
import sellerRoutes from "./routes/seller.routes.js";
import orderRoutes from "./routes/order.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";

import disputeRoutes from "./routes/dispute.routes.js";
import supportRoutes from "./routes/support.routes.js";
import { releaseEscrow } from './controllers/cron.controller.js';

import { errorHandler, notFound } from "./middleware/error.middleware.js";

const app = express();


// ─────────────────────────────────────────
// ⚠️ PAYSTACK WEBHOOK - Raw body parsing
// Must come BEFORE json() middleware
// ─────────────────────────────────────────
app.use(["/api/webhooks/paystack", "/api/webhook/paystack"], raw({ type: 'application/json' }));

// ─────────────────────────────────────────
// 🔐 Security
// ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.paystack.co"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "https://res.cloudinary.com", "data:", "blob:"],
      connectSrc: ["'self'", "https://api.paystack.co"],
      fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─────────────────────────────────────────
// 🌍 CORS CONFIG
// ─────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      const isAllowed = allowedOrigins.some((allowed) => allowed === origin);

      if (isAllowed) {
        return callback(null, true);
      }

      console.log("⚠️ CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    // SECURITY: credentials: true allows cookies/auth headers cross-origin.
    // This means ANY origin in the whitelist can make credentialed requests
    // on behalf of the user, so the whitelist must be strictly controlled.
    // Never set this to true with origin: "*".
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  })
);

// Preflight — uses the same origin validator for consistency
app.options("*", cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some((allowed) => allowed === origin);
    callback(null, isAllowed);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 86400,
}));


// ─────────────────────────────────────────
// 🆔 Request ID
// ─────────────────────────────────────────
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(timeout('25s'));
app.use((req, res, next) => {
  if (req.timedout) return;
  next();
});

// ─────────────────────────────────────────
// 🧱 Core Middleware
// ─────────────────────────────────────────
app.use(json({ limit: "10kb" }));
app.use(urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());
app.use(mongoSanitize());

// ─────────────────────────────────────────
// 📦 File Upload (Multer)
// ─────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use((req, res, next) => {
  req.upload = upload;
  next();
});

// ─────────────────────────────────────────
// 📊 Logger (dev only)
// ─────────────────────────────────────────
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ─────────────────────────────────────────
// 🔐 Auth / Passport
// ─────────────────────────────────────────
app.use(initialize());

// ─────────────────────────────────────────
// 🚦 Rate Limiting
// ─────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests. Try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many auth attempts. Try again later.",
  },
});

// ─────────────────────────────────────────
// 🧪 Health Check
// ─────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ success: true, message: "Chequemart API is running 🚀" });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ignore favicon
app.get("/favicon.ico", (req, res) => res.status(204).end());

// ─────────────────────────────────────────
// 🛣️ Routes
// ─────────────────────────────────────────
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/webhooks", webhookRoutes);
app.get("/api/cron/release-escrow", releaseEscrow);

app.use("/api/disputes", disputeRoutes);
app.use("/api/support", supportRoutes);

// API versioning — v1
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/seller", sellerRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/upload", uploadRoutes);
app.use("/api/v1/webhooks", webhookRoutes);
app.use("/api/v1/disputes", disputeRoutes);
app.use("/api/v1/support", supportRoutes);

// Health check and root
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Chequemart API is running" });
});
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});

// API Documentation
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// ⏱️ Timeout error handler
app.use((err, req, res, next) => {
  if (err.code === 'ETIMEDOUT' || req.timedout) {
    return res.status(503).json({ success: false, message: 'Request timed out' });
  }
  next(err);
});

// ─────────────────────────────────────────
// ❌ Error Handling
// ─────────────────────────────────────────
app.use(notFound);
if (Sentry.Handlers?.errorHandler) {
  app.use(Sentry.Handlers.errorHandler());
}
app.use(errorHandler);

export default app;