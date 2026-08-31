import pkg from "jsonwebtoken";

const { sign, verify } = pkg;

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error(
    "JWT secrets are not configured. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in your .env file."
  );
}

// SECURITY: Specify algorithm to prevent algorithm confusion attacks
const ACCESS_TOKEN_ALGORITHM = "HS256";
const REFRESH_TOKEN_ALGORITHM = "HS256";

/**
 * generateAccessToken
 * Creates a short-lived JWT access token.
 * @param {object} payload - { id, role }
 * @returns {string} Signed JWT access token
 */
const generateAccessToken = (payload) => {
  return sign(payload, ACCESS_TOKEN_SECRET, {
    algorithm: ACCESS_TOKEN_ALGORITHM,
    expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
  });
};

/**
 * generateRefreshToken
 * Creates a long-lived JWT refresh token.
 * @param {object} payload - { id, role }
 * @returns {string} Signed JWT refresh token
 */
const generateRefreshToken = (payload) => {
  return sign(payload, REFRESH_TOKEN_SECRET, {
    algorithm: REFRESH_TOKEN_ALGORITHM,
    expiresIn: process.env.JWT_REFRESH_EXPIRES || "14d",
  });
};

/**
 * verifyAccessToken
 * Verifies and decodes an access token.
 * @param {string} token - JWT access token
 * @returns {object} Decoded payload or throws error
 */
const verifyAccessToken = (token) => {
  return verify(token, ACCESS_TOKEN_SECRET, {
    algorithms: [ACCESS_TOKEN_ALGORITHM],
  });
};

/**
 * verifyRefreshToken
 * Verifies and decodes a refresh token.
 * @param {string} token - JWT refresh token
 * @returns {object} Decoded payload or throws error
 */
const verifyRefreshToken = (token) => {
  return verify(token, REFRESH_TOKEN_SECRET, {
    algorithms: [REFRESH_TOKEN_ALGORITHM],
  });
};

/**
 * Session cookie name — the single opaque HttpOnly cookie that references
 * the server-side session. Scoped to /api so it is never sent with
 * non-API requests or static assets.
 */
export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "sid";

const SESSION_COOKIE_MAX_AGE_MS =
  Number(process.env.SESSION_TTL_DAYS || 7) * 24 * 60 * 60 * 1000;

/**
 * setSessionCookie
 * Sets the single session cookie:
 *   - httpOnly (invisible to JS), secure in production
 *   - SameSite=Lax (blocks most cross-site CSRF)
 *   - path scoped to /api
 * @param {object} res - Express response object
 * @param {string} sid - opaque session id
 */
const setSessionCookie = (res, sid) => {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie(SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api",
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
};

/**
 * clearSessionCookie
 * Clears the session cookie (logout / revoke-sessions).
 * @param {object} res - Express response object
 */
const clearSessionCookie = (res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/api" });
};

export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setSessionCookie,
  clearSessionCookie,
};
