import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.model.js";

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setTokenCookies,
  clearTokenCookies,
} from "../utils/jwt.utils.js";

import {
  generateOTP,
  hashOTP,
  verifyOTP,
  sendOTPviaSMS,
  getOTPExpiry,
} from "../utils/otp.utils.js";

import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../utils/email.utils.js";

import {
  createSubaccount,
  getBankList,
  resolveAccountNumber,
} from "../utils/paystack.utils.js";

// ─────────────────────────────────────────────
//  HELPER: Issue tokens and send response
// ─────────────────────────────────────────────
/**
 * issueTokensAndRespond
 * Generates access + refresh tokens, saves refresh token to DB,
 * sets HTTP-only cookies, and sends JSON response.
 *
 * @param {object} user    - Mongoose user document
 * @param {number} status  - HTTP status code
 * @param {object} res     - Express response object
 */
const issueTokensAndRespond = async (user, status, res) => {
  const payload = { id: user._id, role: user.role, tokenVersion: user.tokenVersion };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Save refresh token to DB for rotation / invalidation
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  // Set tokens as HTTP-only cookies
  setTokenCookies(res, accessToken, refreshToken);

  res.status(status).json({
    success: true,
    accessToken, // Also return in body for clients that use headers
    user: user.toPublicProfile(),
  });
};

// ─────────────────────────────────────────────
//  1. REGISTER — Email or Phone + Password (Customers only)
//     For vendor registration, use POST /api/auth/register/vendor
// ─────────────────────────────────────────────
/**
 * POST /api/auth/register
 * Registers a new CUSTOMER with email+password OR phone+password.
 * Vendors must use POST /api/auth/register/vendor (includes Paystack subaccount).
 *
 * Body: { name, email?, phone?, password }
 * Both email and phone are required.
 */
export async function register(req, res, next) {
  try {
    const {
      name,
      email,
      phone,
      password,
      role = "buyer",
      storeName,
      businessCategory,
      businessAddress,
      bankCode,
      accountNumber,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────
    if (!name || !password) {
      return res.status(400).json({
        success: false,
        message: "Name and password are required.",
      });
    }

    // Must provide at least email or phone
    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: "Both email or phone number is required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    // Validate role
    if (!["buyer", "seller"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be either 'buyer' or 'seller'.",
      });
    }

    // Seller-specific validation
    if (role === "seller") {
      if (!storeName || !businessCategory || !businessAddress) {
        return res.status(400).json({
          success: false,
          message:
            "Store name, business category, and business address are required for sellers.",
        });
      }
    }

    // Determine auth method based on what was provided
    const authMethod = email ? "local" : "phone";

    // ── Check for duplicate email ───────────────────────────────────────
    if (email) {
      const emailExists = await User.findOne({ email: email.toLowerCase() });
      if (emailExists) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists.",
        });
      }
    }

    // ── Check for duplicate phone ───────────────────────────────────────
    if (phone) {
      const phoneExists = await User.findOne({ phone });
      if (phoneExists) {
        return res.status(409).json({
          success: false,
          message: "An account with this phone number already exists.",
        });
      }
    }

    // ── Generate email verification token (only if email provided) ──────
    const verificationToken = email ? randomBytes(32).toString("hex") : null;

    // ── Prepare seller info if role is seller ───────────────────────────
    let sellerInfo = {};
    if (role === "seller") {
      sellerInfo = {
        storeName,
        businessCategory,
        businessAddress,
        isApproved: false,
        businessEmail: email || null,
      };

      // If bank details provided, attempt to create Paystack subaccount
      if (bankCode && accountNumber) {
        try {
          // Verify bank account with Paystack
          const resolvedAccount = await resolveAccountNumber(
            accountNumber,
            bankCode,
          );
          const subaccount = await createSubaccount({
            businessName: storeName,
            bankCode,
            accountNumber,
            description: `Chequemart seller: ${storeName}`,
          });
          sellerInfo.paystackSubaccountCode = subaccount.subaccount_code;
          sellerInfo.paystackSubaccountId = String(subaccount.id);
          sellerInfo.bankCode = bankCode;
          sellerInfo.bankName = subaccount.settlement_bank;
          sellerInfo.accountNumber = accountNumber;
          sellerInfo.accountName = resolvedAccount.account_name;
        } catch (paystackError) {
          console.warn(
            "Paystack subaccount creation failed:",
            paystackError.message,
          );
          // Continue without subaccount; seller can add bank details later
        }
      }
    }

    // ── Create user account (password hashed by pre-save hook) ───────
    const user = await User.create({
      name,
      email: email ? email.toLowerCase() : undefined,
      phone: phone || undefined,
      password,
      role,
      authMethod,
      isVerified: !email, // Phone-only users are auto-verified (no email to send to)
      emailVerificationToken: verificationToken,
      sellerInfo: role === "seller" ? sellerInfo : undefined,
    });

    // ── Send verification email if email was provided ───────────────────
    if (email) {
      try {
        await sendVerificationEmail(user.email, user.name, verificationToken);
      } catch (emailError) {
        console.error(
          "⚠️ Verification email failed to send:",
          emailError.message,
        );
      }
    }

    // ── Issue JWT tokens and respond ────────────────────────────────────
    await issueTokensAndRespond(user, 201, res);
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  2. LOGIN — Email or Phone + Password
// ─────────────────────────────────────────────
/**
 * POST /api/auth/login
 * Authenticates a user with email+password OR phone+password.
 * Nigerian users commonly register with phone numbers,
 * so both login methods must be supported.
 *
 * Body: { identifier, password }
 * identifier can be an email address or a phone number.
 */
export async function login(req, res, next) {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/phone and password are required.",
      });
    }

    // ── Detect whether identifier is email or phone ──────────────────────
    // Simple check: if it contains "@" it's an email, otherwise treat as phone
    const isEmail = identifier.includes("@");
    const query = isEmail
      ? { email: identifier.toLowerCase() }
      : { phone: identifier };

    // Find user and explicitly select password (hidden by default via select: false)
    const user = await User.findOne(query).select("+password +failedLoginAttempts +lockedUntil");

    // Check if account is locked due to too many failed attempts
    if (user && user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(429).json({
        success: false,
        message: "Too many login attempts. Please try again later.",
      });
    }

    // Generic message prevents email/phone enumeration attacks
    if (!user || !(await user.matchPassword(password))) {
      if (user) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        if (user.failedLoginAttempts >= 5) {
          user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        }
        await user.save({ validateBeforeSave: false });
      }
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Contact support.",
      });
    }

    // Warn if email is unverified (still allow login for now)
    if (!user.isVerified) {
      // Optional: enforce verification by returning 403 instead
      console.warn(`⚠️ Unverified user logging in: ${user.email}`);
    }

    // Reset lockout fields on successful login
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;

    await issueTokensAndRespond(user, 200, res);
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  3. LOGOUT
// ─────────────────────────────────────────────
/**
 * POST /api/auth/logout
 * Clears auth cookies and invalidates refresh token in DB.
 */
export async function logout(req, res, next) {
  try {
    // Remove refresh token from DB to prevent reuse
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    }

    clearTokenCookies(res);

    res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  4. REFRESH TOKEN
// ─────────────────────────────────────────────
/**
 * POST /api/auth/refresh-token
 * Issues a new access token using a valid refresh token.
 * Implements refresh token rotation (old token invalidated).
 */
export async function refreshToken(req, res, next) {
  try {
    // Get refresh token from cookie or body
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No refresh token provided.",
      });
    }

    // Verify the token signature
    const decoded = verifyRefreshToken(token);

    // Find user and check stored refresh token matches (rotation check)
    const user = await User.findById(decoded.id).select("+refreshToken");

    if (!user || user.refreshToken !== token) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token. Please log in again.",
      });
    }

    // Issue new tokens (rotation)
    await issueTokensAndRespond(user, 200, res);
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  5. REGISTER VENDOR — With Paystack Subaccount
// ─────────────────────────────────────────────
/**
 * POST /api/auth/register/vendor
 * Registers a new vendor account AND creates their Paystack subaccount.
 *
 * The Paystack subaccount is the mechanism behind escrow:
 * when a buyer pays, the seller's portion goes into this subaccount
 * and stays there until delivery is confirmed.
 *
 * Flow:
 *   1. Validate inputs
 *   2. Check for duplicate email/phone
 *   3. Verify bank account with Paystack (resolveAccountNumber)
 *   4. Create Paystack subaccount
 *   5. Create vendor user in MongoDB with subaccount details
 *   6. Send verification email if email provided
 *
 * Body: {
 *   name, email?, phone?, password,
 *   storeName, bankCode, accountNumber
 * }
 */
export async function registerVendor(req, res, next) {
  // Override role to 'seller' and delegate to register
  req.body.role = "seller";
  return register(req, res, next);
}

// ─────────────────────────────────────────────
//  6. GET BANKS — For Vendor Registration Form
// ─────────────────────────────────────────────
/**
 * GET /api/auth/banks
 * Returns the list of Nigerian banks supported by Paystack.
 * Used to populate the bank dropdown in the vendor registration form.
 * Public route — no auth required.
 */
export async function getBanks(req, res, next) {
  try {
    const banks = await getBankList();

    res.status(200).json({
      success: true,
      count: banks.length,
      banks,
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  7. RESOLVE BANK ACCOUNT — For Vendor Registration
// ─────────────────────────────────────────────
/**
 * POST /api/auth/resolve-account
 * Resolves a bank account number to get the account holder's name.
 * Called live on the vendor registration form to confirm the account before submitting.
 * Public route — no auth required.
 *
 * Body: { accountNumber, bankCode, accountType? }
 */
export async function resolveAccount(req, res, next) {
  try {
    let { accountNumber, bankCode, accountType } = req.body;

    // ───── Validate required fields ─────
    if (!accountNumber || typeof accountNumber !== "string") {
      return res.status(400).json({
        success: false,
        message: "Account number is required",
      });
    }

    if (!bankCode || typeof bankCode !== "string") {
      return res.status(400).json({
        success: false,
        message: "Bank code is required",
      });
    }

    // ───── Clean & validate account number ─────
    const cleanedAccount = accountNumber.replace(/\s/g, "");

    if (!/^\d{10}$/.test(cleanedAccount)) {
      return res.status(400).json({
        success: false,
        message: "Account number must be exactly 10 digits",
      });
    }

    // ───── Validate bank code format (numeric, 3–6 digits typical) ─────
    if (!/^\d{3,6}$/.test(bankCode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid bank code format",
      });
    }

    // ───── Call Paystack helper ─────
    const result = await resolveAccountNumber(
      cleanedAccount,
      bankCode,
      accountType,
    );

    // ───── Handle unexpected Paystack response ─────
    if (!result || !result.account_name) {
      return res.status(400).json({
        success: false,
        message: "Unable to resolve account. Please verify details.",
      });
    }

    // ───── Success response ─────
    return res.status(200).json({
      success: true,
      data: {
        accountName: result.account_name,
        accountNumber: result.account_number,
      },
    });
  } catch (error) {
    console.error("resolveAccount error:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });

    return res.status(400).json({
      success: false,
      message:
        error?.response?.data?.message ||
        error.message ||
        "Could not resolve account. Please check your details.",
    });
  }
}

// ─────────────────────────────────────────────
//  ⚠️  PHASE 2 — GOOGLE OAUTH CALLBACK
//  Route is DISABLED in auth.routes.js
//  Per PRD Section 8.2: Google OAuth is Phase 2
// ─────────────────────────────────────────────
/**
 * GET /api/auth/google/callback
 * Called by Passport after successful Google OAuth.
 * Issues tokens and redirects to the client.
 *
 * NOT ACTIVE IN MVP — route is commented out in auth.routes.js
 */
export async function googleCallback(req, res, next) {
  try {
    const user = req.user; // Set by Passport

    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
    }

    const payload = { id: user._id, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save refresh token to DB
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    // Redirect to client with token in URL
    res.redirect(
      `${process.env.CLIENT_URL}/auth/callback?token=${accessToken}`,
    );
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  ⚠️  PHASE 2 — SEND PHONE OTP (route disabled in auth.routes.js)
//  Per PRD Section 8.2: SMS notifications are Phase 2
// ─────────────────────────────────────────────
/**
 * POST /api/auth/send-otp
 * Sends a 6-digit OTP via Twilio SMS.
 * NOT ACTIVE IN MVP — route is commented out in auth.routes.js
 */
export async function sendPhoneOTP(req, res, next) {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required.",
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const hashedOtp = await hashOTP(otp);
    const expiresAt = getOTPExpiry();

    // Upsert user: create if not exists, update OTP if exists
    await User.findOneAndUpdate(
      { phone },
      {
        phone,
        authMethod: "phone",
        otp: { code: hashedOtp, expiresAt },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Send OTP via SMS
    await sendOTPviaSMS(phone, otp);

    res.status(200).json({
      success: true,
      message: `OTP sent to ${phone}. It expires in 10 minutes.`,
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  7. VERIFY PHONE OTP
// ─────────────────────────────────────────────
/**
 * POST /api/auth/verify-otp
 * Verifies the OTP and logs in or registers the user.
 *
 * Body: { phone, otp, name? }
 */
export async function verifyPhoneOTP(req, res, next) {
  try {
    const { phone, otp, name } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP are required.",
      });
    }

    // Fetch user with OTP fields (hidden by default)
    const user = await User.findOne({ phone }).select(
      "+otp.code +otp.expiresAt",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Phone number not found. Please request a new OTP.",
      });
    }

    // Check OTP expiry
    if (!user.otp?.expiresAt || user.otp.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    // Verify OTP
    const isValid = await verifyOTP(otp, user.otp.code);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP.",
      });
    }

    // Mark user as verified and clear OTP
    user.isVerified = true;
    user.otp = undefined;

    // Set name if this is a first-time login
    if (!user.name && name) {
      user.name = name;
    }

    await user.save({ validateBeforeSave: false });

    await issueTokensAndRespond(user, 200, res);
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  8. VERIFY EMAIL
// ─────────────────────────────────────────────
/**
 * GET /api/auth/verify-email?token=xxx
 * Verifies the user's email address using the token sent during registration.
 */
export async function verifyEmail(req, res, next) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token is missing.",
      });
    }

    const user = await User.findOne({
      emailVerificationToken: token,
    }).select("+emailVerificationToken");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification token.",
      });
    }

    // Mark as verified and remove the token
    user.isVerified = true;
    user.emailVerificationToken = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Email verified successfully. You can now log in.",
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  9. FORGOT PASSWORD
// ─────────────────────────────────────────────
/**
 * POST /api/auth/forgot-password
 * Sends a password reset link to the user's email.
 *
 * Body: { email }
 */
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If this email is registered, a reset link has been sent.",
      });
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString("hex");

    user.passwordResetToken = resetToken;
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save({ validateBeforeSave: false });

    console.log("🔐 Password reset token generated for:", email);
    console.log(
      "🔗 Reset URL will be:",
      `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`,
    );

    // Send reset email
    try {
      const emailResult = await sendPasswordResetEmail(
        user.email,
        user.name,
        resetToken,
      );
      if (!emailResult) {
        // Email failed to send but don't reveal this to user
        console.error(" Email sending returned null");
      }
    } catch (emailError) {
      // Clean up token if email fails
      console.error("Failed to send password reset email:", emailError.message);
      user.passwordResetToken = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(200).json({
        success: true,
        message: "If this email is registered, a reset link has been sent.",
      });
    }

    res.status(200).json({
      success: true,
      message: "If this email is registered, a reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    next(error);
  }
}

// ─────────────────────────────────────────────
//  9B. FORGOT PASSWORD (OTP)
// ─────────────────────────────────────────────
/**
 * POST /api/auth/forgot-password-otp
 * Sends OTP for password reset via email or SMS.
 *
 * Body: { email } or { phone }
 */
export async function forgotPasswordOTP(req, res, next) {
  try {
    const { email, phone } = req.body;
    const identifier = email || phone;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Email or phone is required.",
      });
    }

    // Find user by email or phone
    let user;
    if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
    } else {
      user = await User.findOne({ phone });
    }

    // Always return success to prevent enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If this account is registered, a reset code has been sent.",
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const hashedOtp = await hashOTP(otp);
    const expiresAt = getOTPExpiry();

    user.passwordResetOTP = { code: hashedOtp, expiresAt };
    await user.save({ validateBeforeSave: false });

    // Send OTP via email or SMS
    if (email) {
      try {
        await sendPasswordResetEmail(user.email, user.name, otp, true);
      } catch (emailError) {
        console.error("Failed to send reset email:", emailError.message);
      }
    } else {
      try {
        await sendOTPviaSMS(phone, otp);
      } catch (smsError) {
        console.error("Failed to send SMS:", smsError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "If this account is registered, a reset code has been sent.",
    });
  } catch (error) {
    console.error("❌ Forgot password OTP error:", error);
    next(error);
  }
}

// ─────────────────────────────────────────────
//  9C. VERIFY RESET OTP
// ─────────────────────────────────────────────
/**
 * POST /api/auth/verify-reset-otp
 * Verifies the OTP and returns a reset token.
 *
 * Body: { identifier, otp }
 */
export async function verifyResetOTP(req, res, next) {
  try {
    const { identifier, otp } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({
        success: false,
        message: "Identifier and OTP are required.",
      });
    }

    // Find user by email or phone
    let user;
    if (identifier.includes("@")) {
      user = await User.findOne({ email: identifier.toLowerCase() }).select(
        "+passwordResetOTP.code +passwordResetOTP.expiresAt",
      );
    } else {
      user = await User.findOne({ phone: identifier }).select(
        "+passwordResetOTP.code +passwordResetOTP.expiresAt",
      );
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid code.",
      });
    }

    // Check OTP exists
    if (!user.passwordResetOTP) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired code. Please request a new one.",
      });
    }

    // Check OTP expiry
    if (
      !user.passwordResetOTP.expiresAt ||
      user.passwordResetOTP.expiresAt < new Date()
    ) {
      user.passwordResetOTP = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({
        success: false,
        message: "Code has expired. Please request a new one.",
      });
    }

    // Verify OTP
    const isValid = await verifyOTP(otp, user.passwordResetOTP.code);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid code.",
      });
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString("hex");

    user.passwordResetToken = resetToken;
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    user.passwordResetOTP = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Code verified",
      resetToken,
    });
  } catch (error) {
    console.error("❌ Verify reset OTP error:", error);
    next(error);
  }
}

// ─────────────────────────────────────────────
//  10A. RESET PASSWORD (OTP)
// ─────────────────────────────────────────────
/**
 * POST /api/auth/reset-password-otp
 * Resets password using reset token from verify-reset-otp.
 *
 * Body: { resetToken, password }
 */
export async function resetPasswordOTP(req, res, next) {
  try {
    const { resetToken, password } = req.body;

    if (!resetToken || !password) {
      return res.status(400).json({
        success: false,
        message: "Reset token and new password are required.",
      });
    }

    // Find user by reset token
    const user = await User.findOne({
      passwordResetToken: resetToken,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset link.",
      });
    }

    // Check password is not same as old
    const isSamePassword = await bcrypt.compare(password, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password cannot be the same as your current password.",
      });
    }

    // Update password (pre-save hook will hash it)
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    console.error("❌ Reset password OTP error:", error);
    next(error);
  }
}

// ─────────────────────────────────────────────
//  10. RESET PASSWORD
// ─────────────────────────────────────────────
/**
 * POST /api/auth/reset-password
 * Resets the user's password using the token from the email link.
 *
 * Body: { token, password }
 */
export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    // Find user with valid (non-expired) reset token
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpiresAt: { $gt: new Date() }, // Token must not be expired
    }).select("+passwordResetToken +passwordResetExpiresAt");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token.",
      });
    }

    // Update password and clear reset token fields
    user.password = password; // Will be hashed by pre-save hook
    user.passwordResetToken = undefined;
    user.passwordResetExpiresAt = undefined;
    user.refreshToken = undefined; // Invalidate all sessions
    await user.save();

    res.status(200).json({
      success: true,
      message:
        "Password reset successfully. Please log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  12. BECOME SELLER — Upgrade buyer to seller
// ─────────────────────────────────────────────
/**
 * POST /api/auth/become-seller
 * Upgrades a buyer account to a seller account.
 * Requires storeName, businessCategory, businessAddress.
 * Optional bank details for Paystack subaccount.
 *
 * Body: { storeName, businessCategory, businessAddress, bankCode?, accountNumber? }
 */
export async function becomeSeller(req, res, next) {
  try {
    const {
      storeName,
      businessCategory,
      businessAddress,
      bankCode,
      accountNumber,
    } = req.body;

    // Validate required fields
    if (!storeName || !businessCategory || !businessAddress) {
      return res.status(400).json({
        success: false,
        message:
          "Store name, business category, and business address are required.",
      });
    }

    // Ensure user is a buyer
    if (req.user.role !== "buyer") {
      return res.status(400).json({
        success: false,
        message: "Only buyers can become sellers.",
      });
    }

    // Check if user already has sellerInfo (should not happen)
    if (req.user.sellerInfo && req.user.sellerInfo.storeName) {
      return res.status(400).json({
        success: false,
        message: "User already has seller information.",
      });
    }

    const user = await User.findById(req.user._id);

    // Prepare seller info
    const sellerInfo = {
      storeName,
      businessCategory,
      businessAddress,
      isApproved: false,
      onboardingComplete: false,
      businessEmail: user.email || null,
    };

    // If bank details provided, attempt to create Paystack subaccount
    if (bankCode && accountNumber) {
      try {
        const resolvedAccount = await resolveAccountNumber(
          accountNumber,
          bankCode,
        );
        const subaccount = await createSubaccount({
          businessName: storeName,
          bankCode,
          accountNumber,
          description: `Chequemart seller: ${storeName}`,
        });
        sellerInfo.paystackSubaccountCode = subaccount.subaccount_code;
        sellerInfo.paystackSubaccountId = String(subaccount.id);
        sellerInfo.bankCode = bankCode;
        sellerInfo.bankName = subaccount.settlement_bank;
        sellerInfo.accountNumber = accountNumber;
        sellerInfo.accountName = resolvedAccount.account_name;
      } catch (paystackError) {
        console.warn(
          "Paystack subaccount creation failed:",
          paystackError.message,
        );
        // Continue without subaccount; seller can add bank details later
      }
    }

    // Update user role and sellerInfo
    user.role = "seller";
    user.sellerInfo = sellerInfo;
    await user.save();

    // Issue new JWT with seller role
    await issueTokensAndRespond(user, 200, res);
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  13. COMPLETE ONBOARDING
// ─────────────────────────────────────────────
/**
 * POST /api/auth/complete-onboarding
 * Accepts all onboarding fields, validates them, and saves to sellerInfo.
 * Body: { personal, store, bank, media? }
 */
export async function completeOnboarding(req, res, next) {
  try {
    const user = req.user;

    if (user.role !== "seller") {
      return res.status(400).json({
        success: false,
        message: "Only sellers can complete onboarding.",
      });
    }

    const { personal, store, bank, media } = req.body;

    // ── Validate required fields ──────────────────────────
    const missing = [];
    if (!store?.storeName?.trim()) missing.push("store.storeName");
    if (!store?.category?.trim()) missing.push("store.category");
    if (!store?.location?.trim()) missing.push("store.location");
    if (!store?.description?.trim()) missing.push("store.description");
    if (!bank?.bankCode?.trim()) missing.push("bank.bankCode");
    if (!bank?.accountNumber?.trim()) missing.push("bank.accountNumber");
    if (!bank?.accountName?.trim()) missing.push("bank.accountName");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    // ── Update user-level fields ──────────────────────────
    if (personal) {
      const firstName = personal.firstName?.trim() || "";
      const lastName = personal.lastName?.trim() || "";
      if (firstName || lastName) user.name = `${firstName} ${lastName}`.trim();
      if (personal.email?.trim()) user.email = personal.email.trim();
      if (personal.phone?.trim()) user.phone = personal.phone.trim();
    }

    // ── Build sellerInfo (merge with existing data) ───────
    const sellerInfo = user.sellerInfo || {};

    sellerInfo.storeName = store.storeName.trim();
    sellerInfo.businessCategory = store.category.trim();
    sellerInfo.description = store.description.trim();
    sellerInfo.location = store.location.trim();
    sellerInfo.businessAddress = store.location.trim();

    sellerInfo.bankCode = bank.bankCode.trim();
    sellerInfo.bankName = bank.bankName?.trim() || sellerInfo.bankName || "";
    sellerInfo.accountNumber = bank.accountNumber.trim();
    sellerInfo.accountName = bank.accountName.trim();

    // Media — Cloudinary URLs
    if (media) {
      if (media.logo) sellerInfo.logo = media.logo;
      if (media.banner) sellerInfo.banner = media.banner;
    }

    // Social links (optional)
    if (store.socialLinks) {
      sellerInfo.socialLinks = {
        ...(sellerInfo.socialLinks || {}),
        ...store.socialLinks,
      };
    }

    // ── Mark complete and save ────────────────────────────
    sellerInfo.onboardingComplete = true;
    user.sellerInfo = sellerInfo;
    user.markModified('sellerInfo');
    await user.save();

    res.status(200).json({
      success: true,
      message: "Onboarding completed successfully.",
      user: user.toPublicProfile(),
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  REVOKE ALL SESSIONS
// ─────────────────────────────────────────────
/**
 * POST /api/auth/revoke-sessions
 * Increments tokenVersion to invalidate all existing JWTs.
 */
export async function revokeSessions(req, res, next) {
  try {
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
    await req.user.save({ validateBeforeSave: false });
    const { clearTokenCookies } = await import("../utils/jwt.utils.js");
    clearTokenCookies(res);
    res.status(200).json({
      success: true,
      message: "All sessions revoked successfully.",
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────
//  14. GET CURRENT USER
// ─────────────────────────────────────────────
/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 * Protected route — requires valid access token.
 */
export async function getMe(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      user: req.user.toPublicProfile(),
    });
  } catch (error) {
    next(error);
  }
}
