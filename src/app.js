import express, { json, urlencoded } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { initialize } from "./config/passport.js";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import productRoutes from "./routes/product.routes.js";
import sellerRoutes from "./routes/seller.routes.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";

const app = express();

// ─────────────────────────────────────────
// 🔐 Security
// ─────────────────────────────────────────
app.use(helmet());

// ─────────────────────────────────────────
// 🌍 CORS CONFIG (FIXED)
// ─────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://chequemart.com",
  "https://chequemart.vercel.app"
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests like Postman, mobile apps
      if (!origin) return callback(null, true);

      const isAllowed =
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app") ||
        origin.endsWith(".chequemart.com");

      if (isAllowed) {
        return callback(null, true);
      }

      console.error("❌ CORS blocked:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// ✅ IMPORTANT: Handle preflight requests
app.options("*", cors());

// ─────────────────────────────────────────
// 🧱 Core Middleware
// ─────────────────────────────────────────
app.use(json({ limit: "10kb" }));
app.use(urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

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

// ─────────────────────────────────────────
// ❌ Error Handling
// ─────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;