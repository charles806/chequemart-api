/**
 * ─
 *  middleware/error.middleware.js
 *  Global error handler for the Express app.
 *  Must be registered as the LAST middleware in app.js.
 *
 *  Handles:
 *    - Mongoose validation errors
 *    - Mongoose duplicate key errors
 *    - Mongoose cast errors (invalid ObjectId)
 *    - JWT errors
 *    - General application errors
 *    - Sentry error capture
 * ─
 */
import * as Sentry from "@sentry/node";

/**
 * errorHandler
 * Catches all errors passed via next(error) and returns a clean JSON response.
 * @param {Error}  err  - Error object
 * @param {object} req  - Express request
 * @param {object} res  - Express response
 * @param {function} next - Express next (required signature for error middleware)
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  //  Mongoose: Invalid ObjectId (CastError) 
  // SECURITY: Don't expose err.value to prevent information leakage
  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid ID format";
  }

  //  Mongoose: Duplicate Key Error ─
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `This ${field} is already in use`;
  }

  //  Mongoose: Validation Error 
  if (err.name === "ValidationError") {
    statusCode = 400;
    const errors = Object.values(err.errors).map((e) => e.message);
    message = errors.join(". ");
  }

  //  JWT: Expired Token 
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Session expired. Please log in again.";
  }

  //  JWT: Invalid Token 
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token.";
  }

  // 📡 Capture error with Sentry (if configured)
  if (process.env.SENTRY_DSN && statusCode >= 500) {
    Sentry.captureException(err, {
      extra: {
        request: {
          method: req.method,
          url: req.originalUrl,
          headers: req.headers,
        },
        statusCode,
      },
    });
  }

  // Log error in development
  if (process.env.NODE_ENV === "development") {
    console.error("🔴 ERROR:", err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Show stack trace only in development
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

/**
 * notFound
 * Handles requests to undefined routes.
 * @param {object} req  - Express request
 * @param {object} res  - Express response
 * @param {function} next - Express next
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

export { errorHandler, notFound };