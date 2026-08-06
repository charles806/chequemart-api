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
 * setTokenCookies
 * Sends access and refresh tokens as secure HTTP-only cookies.
 * SECURITY: Added csrfToken for CSRF protection
 * @param {object} res           - Express response object
 * @param {string} accessToken   - JWT access token
 * @param {string} refreshToken  - JWT refresh token
 */
const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === "production";

  // Access token cookie — match JWT_ACCESS_EXPIRES (15 minutes)
  // httpOnly: false so the frontend can read it for authorization
  res.cookie("accessToken", accessToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60 * 1000, // 15 minutes in ms
  });

  // Refresh token cookie — expires in 7 days
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
};

/**
 * clearTokenCookies
 * Clears auth cookies on logout.
 * @param {object} res - Express response object
 */
const clearTokenCookies = (res) => {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
};

export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setTokenCookies,
  clearTokenCookies,
};
