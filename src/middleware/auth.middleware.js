import { verifyAccessToken } from "../utils/jwt.utils.js";
import User from "../models/User.model.js";

/**
 * protect
 * Middleware that verifies the JWT access token from:
 *   1. Authorization header (Bearer token)
 *   2. HTTP-only cookie (accessToken)
 *
 * If valid, attaches the decoded user to req.user.
 * If invalid or missing, responds with 401 Unauthorized.
 *
 * Usage: router.get("/profile", protect, getProfile)
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // 1. Try to get token from Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // 2. Fall back to cookie
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    // No token found
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    // Verify and decode the token
    const decoded = verifyAccessToken(token);

    // Fetch the user from DB (ensures account still exists and is active)
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Contact support.",
      });
    }

    // Attach user to request for downstream handlers
    req.user = user;
    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Authentication error.",
    });
  }
};

/**
 * restrictTo
 * Role-based access control middleware.
 * Must be used AFTER protect middleware.
 *
 * @param {...string} roles - Allowed roles e.g. "admin", "vendor"
 * @returns Middleware function
 *
 * Usage: router.delete("/user/:id", protect, restrictTo("admin"), deleteUser)
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This route is restricted to: ${roles.join(", ")}.`,
      });
    }
    next();
  };
};

export { protect, restrictTo, optionalAuth };

// ─────────────────────────────────────────
// optionalAuth - Attach user if token exists, but allow unauthenticated access
// ─────────────────────────────────────────
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    // 1. Try to get token from Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // 2. Fall back to cookie
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    // If no token, continue without user (optional auth)
    if (!token) {
      return next();
    }

    // Verify token
    const decoded = await verifyAccessToken(token);
    
    // Attach user to request
    const user = await User.findById(decoded.id).select("-password");
    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    // On error, just continue without user
    next();
  }
};