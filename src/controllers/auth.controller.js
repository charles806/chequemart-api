import { randomBytes } from "crypto";
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
  const payload = { id: user._id, role: user.role };

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
 * At least one of email or phone is required.
 */
export async function register(req, res, next) {
  try {
    const { name, email, phone, password, role = 'buyer', storeName, businessCategory, businessAddress, bankCode, accountNumber } = req.body;

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
        message: "Either email or phone number is required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    // Validate role
    if (!['buyer', 'seller'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be either 'buyer' or 'seller'.",
      });
    }

    // Seller-specific validation
    if (role === 'seller') {
      if (!storeName || !businessCategory || !businessAddress) {
        return res.status(400).json({
          success: false,
          message: "Store name, business category, and business address are required for sellers.",
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
    if (role === 'seller') {
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
          const resolvedAccount = resolveAccountNumber(accountNumber, bankCode);
          const subaccount = createSubaccount({
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
          console.warn('Paystack subaccount creation failed:', paystackError.message);
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
      sellerInfo: role === 'seller' ? sellerInfo : undefined,
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
    const user = await User.findOne(query).select("+password");

    // Generic message prevents email/phone enumeration attacks
    if (!user || !(await user.matchPassword(password))) {
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
  req.body.role = 'seller';
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
 * Verifies a bank account number and returns the account holder's name.
 * Called live on the vendor registration form to confirm the account before submitting.
 * Public route — no auth required.
 *
 * Body: { accountNumber, bankCode }
 */
export async function resolveAccount(req, res, next) {
  try {
    const { accountNumber, bankCode } = req.body;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({
        success: false,
        message: "Account number and bank code are required.",
      });
    }

    const result = resolveAccountNumber(accountNumber, bankCode);

    res.status(200).json({
      success: true,
      accountName: result.account_name,
      accountNumber: result.account_number,
    });
  } catch (error) {
    // Return a user-friendly message if Paystack can't find the account
    return res.status(400).json({
      success: false,
      message: "Could not resolve account. Please check your details.",
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

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    // Redirect to client dashboard
    res.redirect(`${process.env.CLIENT_URL}/dashboard`);
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
    const hashedOtp = hashOTP(otp);
    const expiresAt = getOTPExpiry();

    // Upsert user: create if not exists, update OTP if exists
    await findOneAndUpdate(
      { phone },
      {
        phone,
        authMethod: "phone",
        otp: { code: hashedOtp, expiresAt },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Send OTP via SMS
    sendOTPviaSMS(phone, otp);

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
    const isValid = verifyOTP(otp, user.otp.code);
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
    console.log("🔗 Reset URL will be:", `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`);

    // Send reset email
    try {
      const emailResult = await sendPasswordResetEmail(user.email, user.name, resetToken);
      if (!emailResult) {
        // Email failed to send but don't reveal this to user
        console.error("❌ Email sending returned null");
      }
    } catch (emailError) {
      // Clean up token if email fails
      console.error("❌ Failed to send password reset email:", emailError.message);
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
    console.error("❌ Forgot password error:", error);
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
    const { storeName, businessCategory, businessAddress, bankCode, accountNumber } = req.body;

    // Validate required fields
    if (!storeName || !businessCategory || !businessAddress) {
      return res.status(400).json({
        success: false,
        message: "Store name, business category, and business address are required.",
      });
    }

    // Ensure user is a buyer
    if (req.user.role !== 'buyer') {
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
        const resolvedAccount = resolveAccountNumber(accountNumber, bankCode);
        const subaccount = createSubaccount({
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
        console.warn('Paystack subaccount creation failed:', paystackError.message);
        // Continue without subaccount; seller can add bank details later
      }
    }

    // Update user role and sellerInfo
    user.role = 'seller';
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
 * Marks seller onboarding as complete.
 * Called after seller finishes the onboarding flow.
 */
export async function completeOnboarding(req, res, next) {
  try {
    const user = req.user;

    if (user.role !== 'seller') {
      return res.status(400).json({
        success: false,
        message: "Only sellers can complete onboarding.",
      });
    }

    if (!user.sellerInfo) {
      return res.status(400).json({
        success: false,
        message: "Seller info not found.",
      });
    }

    user.sellerInfo.onboardingComplete = true;
    await user.save({ validateBeforeSave: false });

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
