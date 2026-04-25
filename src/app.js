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

// ── Security Middleware

app.use(helmet());

// CORS: Only allow requests from the client URL
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle multipart/form-data for file uploads (higher limit for images)
app.use(json({ limit: "10kb" }));

app.get("/", (req, res) => {
  res.json({ success: true, message: "Chequemart API is running" });
});

// Ignore favicon requests
app.get("/favicon.ico", (req, res) => res.status(204).end());


const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests from this device , Please try again later.",
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
    message: "Too many auth attempts. Please try again later.",
  },
});

//General Middleware

// Parse JSON request bodies (max 10kb to prevent large payload attacks)
app.use(json({ limit: "10kb" }));

// Parse URL-encoded bodies (for form submissions)
app.use(urlencoded({ extended: true, limit: "10kb" }));

// Parse cookies (needed for HTTP-only cookie auth)
app.use(cookieParser());

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Make upload available to routes
app.use((req, res, next) => {
  req.upload = upload;
  next();
});

// HTTP request logger (only in development)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Initialize Passport (for Google OAuth)
app.use(initialize());

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Chequemart API is running 🚀",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});


app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/seller", sellerRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;