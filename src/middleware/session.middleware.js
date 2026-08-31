// middleware/session.middleware.js
//
// Core session authentication. The browser only ever sends a single opaque
// HttpOnly "sid" cookie. This middleware:
//   1. Reads the sid cookie and loads the server-side session.
//   2. Verifies the session's access token (signature-only, no I/O).
//   3. Transparently refreshes tokens (and slides the cookie) if it expired.
//   4. Attaches req.user (fresh from the DB) and req.session to the request.

import User from "../models/User.model.js";
import {
  SESSION_COOKIE_NAME,
  verifyAccessToken,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  clearSessionCookie,
  setSessionCookie,
} from "../utils/jwt.utils.js";
import {
  getSession,
  updateSession,
  deleteSession,
} from "../services/session.service.js";

/**
 * loadSessionUser
 * Shared implementation for protect (optional=false) and optionalAuth.
 * Never throws for auth failures — it responds (or passes through) itself.
 */
const loadSessionUser = async (req, res, next, optional) => {
  try {
    const sid = req.cookies?.[SESSION_COOKIE_NAME];

    if (!sid) {
      if (optional) return next();
      return res.status(401).json({
        success: false,
        message: "Access denied. No session provided.",
      });
    }

    const session = await getSession(sid);

    if (!session) {
      clearSessionCookie(res);
      if (optional) return next();
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    // Verify the session's access token. If expired, refresh transparently
    // using the refresh token stored in the session (rotation).
    let decoded;
    try {
      decoded = verifyAccessToken(session.accessToken);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        try {
          const refreshed = verifyRefreshToken(session.refreshToken);
          const payload = {
            id: refreshed.id,
            role: refreshed.role,
            tokenVersion: refreshed.tokenVersion,
          };
          const accessToken = generateAccessToken(payload);
          const refreshToken = generateRefreshToken(payload);
          await updateSession(sid, { accessToken, refreshToken });
          setSessionCookie(res, sid); // rolling session
          decoded = payload;
        } catch (refreshError) {
          // Refresh token invalid/expired/rotated — destroy the session
          await deleteSession(sid);
          clearSessionCookie(res);
          if (optional) return next();
          return res.status(401).json({
            success: false,
            message: "Session expired. Please log in again.",
          });
        }
      } else if (optional) {
        return next();
      } else {
        return res.status(401).json({
          success: false,
          message: "Invalid session.",
        });
      }
    }

    if (!decoded?.id) {
      if (optional) return next();
      return res.status(401).json({
        success: false,
        message: "Invalid session payload.",
      });
    }

    const user = await User.findById(decoded.id).select("-password +tokenVersion");

    if (!user) {
      await deleteSession(sid);
      clearSessionCookie(res);
      if (optional) return next();
      return res.status(401).json({
        success: false,
        message: "User no longer exists.",
      });
    }

    if (!user.isActive) {
      if (optional) return next();
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated.",
      });
    }

    if (decoded.tokenVersion !== undefined && user.tokenVersion !== decoded.tokenVersion) {
      await deleteSession(sid);
      clearSessionCookie(res);
      if (optional) return next();
      return res.status(401).json({
        success: false,
        message: "Session revoked. Please log in again.",
        code: "TOKEN_REVOKED",
      });
    }

    req.user = user;
    req.session = { sid, userId: user._id };

    next();
  } catch (error) {
    console.error("[SESSION AUTH ERROR]", error);
    if (optional) return next();
    return res.status(500).json({
      success: false,
      message: "Authentication failed.",
    });
  }
};

export const authenticateSessionRequired = (req, res, next) =>
  loadSessionUser(req, res, next, false);

export const authenticateSessionOptional = (req, res, next) =>
  loadSessionUser(req, res, next, true);