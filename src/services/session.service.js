import { randomBytes } from "crypto";
import Session from "../models/Session.model.js";

/**
 * Session store — MongoDB-backed implementation.
 * Buried behind this module's interface so Redis can be swapped in later
 * without touching controllers or middleware.
 *
 * TTL is derived from the refresh-token lifetime (default 7 days).
 */
const SESSION_TTL_MS =
  Number(process.env.SESSION_TTL_DAYS || 7) * 24 * 60 * 60 * 1000;

const generateSessionId = () => randomBytes(32).toString("hex");

/**
 * createSession
 * Creates a new session record and returns its opaque session id.
 * @param {object} data - { userId, accessToken, refreshToken, userSnapshot }
 * @returns {Promise<string>} sessionId
 */
export const createSession = async ({ userId, accessToken, refreshToken, userSnapshot }) => {
  const sessionId = generateSessionId();
  await Session.create({
    sessionId,
    userId,
    accessToken,
    refreshToken,
    userSnapshot,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return sessionId;
};

/**
 * getSession
 * @param {string} sid - the opaque session id from the cookie
 * @returns {Promise<object|null>} session record (raw mongoose doc) or null
 */
export const getSession = async (sid) => {
  if (!sid) return null;
  return Session.findOne({ sessionId: sid });
};

/**
 * updateSession
 * Atomically refreshes token fields and slides the expiry window
 * (rolling session) on a rotating refresh.
 * @param {string} sid
 * @param {object} patch - { accessToken?, refreshToken?, userSnapshot? }
 * @param {boolean} slide - extend expiresAt (rolling)
 * @returns {Promise<object|null>}
 */
export const updateSession = async (sid, patch, slide = true) => {
  const update = { ...patch };
  if (slide) {
    update.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  }
  return Session.findOneAndUpdate({ sessionId: sid }, update, { new: true });
};

/**
 * deleteSession
 * Destroys a single session (logout).
 */
export const deleteSession = async (sid) => {
  if (!sid) return null;
  return Session.deleteOne({ sessionId: sid });
};

/**
 * deleteSessionsByUser
 * Destroys every session for a user (logout-all / revoke-sessions).
 */
export const deleteSessionsByUser = async (userId) => {
  return Session.deleteMany({ userId });
};