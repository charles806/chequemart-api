import { body, param, query, validationResult } from "express-validator";

/**
 * ───────────────────────────────────────────────────────────────
 * Input Validation Middleware
 * SECURITY: Validate and sanitize ALL user inputs on server side
 * Prevents: SQL injection, XSS, malformed data attacks
 * ───────────────────────────────────────────────────────────────
 */

// Helper to run validation and return errors
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

// ───────────────────────────────────────────────────────────────
// Auth Validation Rules
// ───────────────────────────────────────────────────────────────

export const registerValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 60 })
    .withMessage("Name must be between 2 and 60 characters")
    .escape(), // SECURITY: HTML escape to prevent XSS
  body("password")
    .isLength({ min: 8, max: 100 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain uppercase, lowercase, and number"),
  body("email")
    .optional()
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(), // SECURITY: normalize email to prevent duplicate accounts
  body("phone")
    .optional()
    .matches(/^\+?[0-9]\d{6,14}$/)
    .withMessage("Invalid phone number format"),
  body("role")
    .optional()
    .isIn(['buyer', 'seller'])
    .withMessage("Role must be either 'buyer' or 'seller'"),
  body("storeName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Store name cannot be empty if provided")
    .isLength({ min: 2, max: 100 })
    .escape(),
  body("businessCategory")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Business category cannot be empty if provided")
    .isLength({ min: 2, max: 100 })
    .escape(),
  body("businessAddress")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Business address cannot be empty if provided")
    .isLength({ min: 2, max: 500 })
    .escape(),
];

export const loginValidation = [
  body("identifier")
    .trim()
    .notEmpty()
    .withMessage("Email or phone number is required")
    .isLength({ max: 100 })
    .withMessage("Identifier too long"),
  body("password")
    .notEmpty()
    .withMessage("Password is required"),
];

export const vendorRegisterValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 60 })
    .escape(),
  body("password")
    .isLength({ min: 8, max: 100 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain uppercase, lowercase, and number"),
  body("email")
    .optional()
    .isEmail()
    .normalizeEmail(),
  body("phone")
    .optional()
    .matches(/^\+?[0-9]\d{6,14}$/),
  body("storeName")
    .trim()
    .notEmpty()
    .withMessage("Store name is required")
    .isLength({ min: 2, max: 100 })
    .escape(),
  body("businessCategory")
    .trim()
    .notEmpty()
    .withMessage("Business category is required")
    .isLength({ min: 2, max: 100 })
    .escape(),
  body("businessAddress")
    .trim()
    .notEmpty()
    .withMessage("Business address is required")
    .isLength({ min: 2, max: 500 })
    .escape(),
  body("bankCode")
    .optional()
    .trim()
    .isLength({ min: 3, max: 10 })
    .escape(),
  body("accountNumber")
    .optional()
    .trim()
    .isLength({ min: 10, max: 10 })
    .isNumeric()
    .withMessage("Account number must be 10 digits"),
];

export const becomeSellerValidation = [
  body("storeName")
    .trim()
    .notEmpty()
    .withMessage("Store name is required")
    .isLength({ min: 2, max: 100 })
    .escape(),
  body("businessCategory")
    .trim()
    .notEmpty()
    .withMessage("Business category is required")
    .isLength({ min: 2, max: 100 })
    .escape(),
  body("businessAddress")
    .trim()
    .notEmpty()
    .withMessage("Business address is required")
    .isLength({ min: 2, max: 500 })
    .escape(),
  body("bankCode")
    .optional()
    .trim()
    .isLength({ min: 3, max: 10 })
    .escape(),
  body("accountNumber")
    .optional()
    .trim()
    .isLength({ min: 10, max: 10 })
    .isNumeric()
    .withMessage("Account number must be 10 digits"),
];

export const resolveAccountValidation = [
  body("accountNumber")
    .trim()
    .notEmpty()
    .isLength({ min: 10, max: 10 })
    .isNumeric()
    .withMessage("Account number must be 10 digits"),
  body("bankCode")
    .trim()
    .notEmpty()
    .isLength({ min: 3, max: 10 })
    .escape(),
];

export const forgotPasswordValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .normalizeEmail(),
];

export const resetPasswordValidation = [
  body("token")
    .trim()
    .notEmpty()
    .withMessage("Token is required")
    .isLength({ min: 64, max: 64 })
    .withMessage("Invalid token format"),
  body("password")
    .isLength({ min: 8, max: 100 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain uppercase, lowercase, and number"),
];

export const verifyEmailValidation = [
  query("token")
    .trim()
    .notEmpty()
    .withMessage("Token is required")
    .isLength({ min: 64, max: 64 })
    .withMessage("Invalid token format"),
];
