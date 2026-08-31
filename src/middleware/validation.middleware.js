import { body, param, query, validationResult } from "express-validator";
import { sanitizeObject } from '../utils/sanitize.js';

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

export const sanitizeInput = (fields = []) => (req, res, next) => {
  if (req.body && fields.length > 0) {
    req.body = sanitizeObject(req.body, fields);
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

// ───────────────────────────────────────────────────────────────
// Order Validation Rules
// ───────────────────────────────────────────────────────────────
export const createOrderValidation = [
  body("items").isArray({ min: 1 }).withMessage("At least one item is required"),
  body("items.*.productId").isMongoId().withMessage("Invalid product ID"),
  body("items.*.quantity").isInt({ min: 1 }).withMessage("Quantity must be a positive integer"),
  body("shippingAddress.fullName").optional().trim().notEmpty().isLength({ max: 100 }).escape(),
  body("shippingAddress.phone").optional().trim().notEmpty().matches(/^\+?[0-9]\d{6,14}$/),
  body("shippingAddress.address").optional().trim().notEmpty().isLength({ max: 500 }).escape(),
  body("shippingAddress.city").optional().trim().notEmpty().isLength({ max: 100 }).escape(),
  body("shippingAddress.state").optional().trim().notEmpty().isLength({ max: 100 }).escape(),
];

// ───────────────────────────────────────────────────────────────
// Withdrawal Validation Rules
// ───────────────────────────────────────────────────────────────
export const requestWithdrawalValidation = [
  body("amount").isFloat({ min: 100 }).withMessage("Minimum withdrawal is ₦100"),
  body("bankDetailId").isUUID().withMessage("Invalid bank account"),
];

// ───────────────────────────────────────────────────────────────
// Product Validation Rules
// ───────────────────────────────────────────────────────────────
export const createProductValidation = [
  body("name").trim().notEmpty().withMessage("Product name is required").isLength({ max: 100 }).escape(),
  body("description").trim().notEmpty().withMessage("Description is required").isLength({ max: 2000 }).escape(),
  body("price").isFloat({ min: 0 }).withMessage("Price must be a positive number"),
  body("category").trim().notEmpty().withMessage("Category is required"),
  body("stock").optional().isInt({ min: 0 }).withMessage("Stock cannot be negative"),
  body("condition").optional().isIn(["Brand New", "Like New", "Fairly Used", "Refurbished"]),
  body("deliveryFee").optional().isFloat({ min: 0 }),
  body("discountPrice").optional().isFloat({ min: 0 }),
];
