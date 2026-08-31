// middleware/auth.middleware.js

import {
  authenticateSessionRequired,
  authenticateSessionOptional,
} from "./session.middleware.js";

/**
 * PROTECT ROUTES
 * Requires a valid server-side session (single HttpOnly cookie).
 */
const protect = authenticateSessionRequired;

/**
 * OPTIONAL AUTH
 * Runs when a valid session exists; otherwise passes through anonymously.
 */
const optionalAuth = authenticateSessionOptional;

/**
 * ROLE RESTRICTION
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Restricted to: ${roles.join(", ")}`,
      });
    }

    next();
  };
};

export { protect, optionalAuth, restrictTo };