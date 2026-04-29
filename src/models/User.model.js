import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import validator from "validator";

const { Schema, model } = mongoose;

// Extract functions from CommonJS modules
const { genSalt, hash, compare } = bcrypt;
const { isEmail, isMobilePhone } = validator;

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [60, "Name cannot exceed 60 characters"],
    },

    email: {
      type: String,
      unique: true,
      sparse: true, // Allows null (for phone-only users)
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => !v || isEmail(v),
        message: "Invalid email address",
      },
    },

    password: {
      type: String,
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Do not return password by default
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      validate: {
        validator: (v) => !v || isMobilePhone(v, "any"),
        message: "Invalid phone number",
      },
    },

    authMethod: {
      type: String,
      enum: ["local", "phone", "google"],
      default: "local",
    },

    role: {
      type: String,
      enum: ["admin", "buyer", "seller"],
      default: "buyer",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    avatar: {
      type: String,
      default: null,
    },

    otp: {
      code: { type: String, select: false },
      expiresAt: { type: Date, select: false },
    },

    emailVerificationToken: {
      type: String,
      select: false,
    },

    passwordResetToken: {
      type: String,
      select: false,
    },

    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },

    refreshToken: {
      type: String,
      select: false,
    },

    sellerInfo: {
      storeName: { type: String, default: null },
      businessCategory: { type: String, default: null },
      businessAddress: { type: String, default: null },
      isApproved: { type: Boolean, default: false },
      onboardingComplete: { type: Boolean, default: false },
      businessEmail: { type: String, default: null },
      description: { type: String, default: null },
      location: { type: String, default: null },
      category: { type: String, default: null },
      logo: { type: String, default: null },
      banner: { type: String, default: null },
      socialLinks: {
        instagram: { type: String, default: null },
        twitter: { type: String, default: null },
        whatsapp: { type: String, default: null },
      },

      paystackSubaccountCode: { type: String, default: null },
      paystackSubaccountId: { type: String, default: null },
      bankName: { type: String, default: null },
      bankCode: { type: String, default: null },
      accountNumber: { type: String, default: null },
      accountName: { type: String, default: null },
    },

    deliveryAddresses: {
      type: [{
        label: { type: String, default: 'Home' },
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        landmark: { type: String },
        isDefault: { type: Boolean, default: false }
      }],
      default: [],
      comment: "Saved delivery addresses for buyers"
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// ────────────────────────────────────────────────────────────────
// Pre-save middleware to hash password if modified
// ────────────────────────────────────────────────────────────────
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();

  try {
    const salt = await genSalt(12);
    this.password = await hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// Method: matchPassword
// Compares entered password with hashed password
// ────────────────────────────────────────────────────────────────
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await compare(enteredPassword, this.password);
};

// ────────────────────────────────────────────────────────────────
// Method: toPublicProfile
// Returns safe user object for API responses
// SECURITY: Never expose sensitive seller payment details
// ────────────────────────────────────────────────────────────────
UserSchema.methods.toPublicProfile = function () {
  const publicProfile = {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    avatar: this.avatar,
    isVerified: this.isVerified,
    isActive: this.isActive,
    authMethod: this.authMethod,
    createdAt: this.createdAt,
  };

  // Only expose safe seller info (no sensitive payment data)
  if (this.role === "seller" && this.sellerInfo) {
    publicProfile.sellerInfo = {
      storeName: this.sellerInfo.storeName,
      businessCategory: this.sellerInfo.businessCategory,
      businessAddress: this.sellerInfo.businessAddress,
      isApproved: this.sellerInfo.isApproved,
      onboardingComplete: this.sellerInfo.onboardingComplete,
      businessEmail: this.sellerInfo.businessEmail,
      description: this.sellerInfo.description,
      location: this.sellerInfo.location,
      category: this.sellerInfo.category,
      logo: this.sellerInfo.logo,
      banner: this.sellerInfo.banner,
      socialLinks: this.sellerInfo.socialLinks,
      // SECURE: Never expose paystackSubaccountCode, paystackSubaccountId,
      // bankCode, accountNumber, accountName to clients
    };
  }

  return publicProfile;
};

export default model("User", UserSchema);
