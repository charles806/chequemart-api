import { Router } from "express";
const router = Router();

import { register, registerVendor, login, logout, refreshToken, verifyEmail, resendVerification, forgotPassword, forgotPasswordOTP, verifyResetOTP, resetPasswordOTP, resetPassword, getMe, getBanks, resolveAccount, becomeSeller, completeOnboarding, revokeSessions } from "../controllers/auth.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { 
  validate,
  registerValidation, 
  loginValidation, 
  vendorRegisterValidation,
  becomeSellerValidation,
  resolveAccountValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  verifyEmailValidation
} from "../middleware/validation.middleware.js";

//  Customer Registration (with input validation)
router.post("/register", registerValidation, validate, register);

//  Vendor Registration (includes Paystack subaccount creation)
router.post("/register/vendor", vendorRegisterValidation, validate, registerVendor);

//  Login (email or phone + password)
router.post("/login", loginValidation, validate, login);

//  Token Management ─
router.post("/logout", protect, logout);
router.post("/revoke-sessions", protect, revokeSessions);
router.post("/refresh-token", protect, refreshToken);

//  Email Verification 
router.get("/verify-email", verifyEmailValidation, validate, verifyEmail);
router.post("/resend-verification", protect, resendVerification);

//  Password Reset 
router.post("/forgot-password", forgotPasswordValidation, validate, forgotPassword);
router.post("/forgot-password-otp", forgotPasswordOTP);
router.post("/verify-reset-otp", verifyResetOTP);
router.post("/reset-password-otp", resetPasswordOTP);
router.post("/reset-password", resetPasswordValidation, validate, resetPassword);

//  Paystack Bank Helpers (used in vendor registration form)
router.get("/banks", getBanks);
router.post("/resolve-account", resolveAccountValidation, validate, resolveAccount);

//  Current User Profile
router.get("/me", protect, getMe);

//  Become Seller (upgrade buyer to seller)
router.post("/become-seller", protect, becomeSellerValidation, validate, becomeSeller);

//  Complete Onboarding (mark seller onboarding as done)
router.post("/complete-onboarding", protect, completeOnboarding);


// ════════════════════════════════════════════════════════════════════════════════
//  ⚠️  PHASE 2 ROUTES — DISABLED FOR MVP
//  Uncomment these when Phase 2 development begins.
//  Per PRD Section 8.2: SMS notifications are Phase 2 features.
// ════════════════════════════════════════════════════════════════════════════════

//  Phone OTP via SMS (Phase 2)
// router.post("/send-otp", sendPhoneOTP);
// router.post("/verify-otp", verifyPhoneOTP);

export default router;