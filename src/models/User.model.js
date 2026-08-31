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
      enum: ["local", "phone"],
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
      maxlength: [500, "Avatar URL cannot exceed 500 characters"],
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

    passwordResetOTP: {
      code: { type: String, select: false },
      expiresAt: { type: Date, select: false },
    },

    refreshToken: {
      type: String,
      select: false,
    },

    tokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },

    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockedUntil: {
      type: Date,
      default: null,
      select: false,
    },

    sellerInfo: {
      storeName: { type: String, default: null, maxlength: [60, "Store name cannot exceed 60 characters"] },
      businessCategory: { type: String, default: null, maxlength: [60, "Business category cannot exceed 60 characters"] },
      businessAddress: { type: String, default: null, maxlength: [200, "Business address cannot exceed 200 characters"] },
      isApproved: { type: Boolean, default: false },
      onboardingComplete: { type: Boolean, default: false },
      businessEmail: { type: String, default: null },
      description: { type: String, default: null, maxlength: [1000, "Store description cannot exceed 1000 characters"] },
      location: { type: String, default: null, maxlength: [100, "Location cannot exceed 100 characters"] },
      category: { type: String, default: null, maxlength: [60, "Category cannot exceed 60 characters"] },
      logo: { type: String, default: null, maxlength: [500, "Logo URL cannot exceed 500 characters"] },
      banner: { type: String, default: null, maxlength: [500, "Banner URL cannot exceed 500 characters"] },
      socialLinks: {
        instagram: { type: String, default: null, maxlength: [200, "Social link cannot exceed 200 characters"] },
        twitter: { type: String, default: null, maxlength: [200, "Social link cannot exceed 200 characters"] },
        whatsapp: { type: String, default: null, maxlength: [200, "Social link cannot exceed 200 characters"] },
      },

      paystackSubaccountCode: { type: String, default: null, maxlength: [100, "Paystack code cannot exceed 100 characters"] },
      paystackSubaccountId: { type: String, default: null, maxlength: [100, "Paystack ID cannot exceed 100 characters"] },
      bankName: { type: String, default: null, maxlength: [60, "Bank name cannot exceed 60 characters"] },
      bankCode: { type: String, default: null, maxlength: [10, "Bank code cannot exceed 10 characters"] },
      accountNumber: { type: String, default: null, maxlength: [20, "Account number cannot exceed 20 characters"] },
      accountName: { type: String, default: null, maxlength: [100, "Account name cannot exceed 100 characters"] },
    },

    deliveryAddresses: {
      type: [{
        label: { type: String, default: 'Home', maxlength: [40, "Label cannot exceed 40 characters"] },
        fullName: { type: String, required: true, maxlength: [60, "Full name cannot exceed 60 characters"] },
        phone: { type: String, required: true, maxlength: [20, "Phone cannot exceed 20 characters"] },
        address: { type: String, required: true, maxlength: [200, "Address cannot exceed 200 characters"] },
        city: { type: String, required: true, maxlength: [60, "City cannot exceed 60 characters"] },
        state: { type: String, required: true, maxlength: [60, "State cannot exceed 60 characters"] },
        landmark: { type: String, maxlength: [200, "Landmark cannot exceed 200 characters"] },
        isDefault: { type: Boolean, default: false }
      }],
      default: [],
      comment: "Saved delivery addresses for buyers",
      validate: {
        validator: (v) => v.length <= 10,
        message: "Cannot save more than 10 delivery addresses",
      },
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

UserSchema.index({ emailVerificationToken: 1 }, { sparse: true });
UserSchema.index({ passwordResetToken: 1 }, { sparse: true });

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
