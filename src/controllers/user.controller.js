import User from "../models/User.model.js";
import cloudinary, { uploadBufferToCloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";

// ────────────────────────────────────────────────────────────────
// 1. GET PROFILE - Get current user's profile
// ────────────────────────────────────────────────────────────────
/**
 * GET /api/users/profile
 * Returns the current user's profile.
 * Protected route.
 */
export async function getProfile(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      user: req.user.toPublicProfile(),
    });
  } catch (error) {
    next(error);
  }
}

// ────────────────────────────────────────────────────────────────
// 2. UPDATE PROFILE - Update user's personal information
// ────────────────────────────────────────────────────────────────
/**
 * PUT /api/users/profile
 * Updates the current user's profile.
 * Body: { name?, phone? }
 */
export async function updateProfile(req, res, next) {
  try {
    const { name, phone } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Update name if provided
    if (name) {
      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({
          success: false,
          message: "Name must be between 2 and 60 characters.",
        });
      }
      user.name = name.trim();
    }

    // Update phone if provided
    if (phone) {
      const phoneExists = await User.findOne({ phone, _id: { $ne: user._id } });
      if (phoneExists) {
        return res.status(409).json({ success: false, message: "Phone number in use." });
      }
      user.phone = phone;
    }

    // Update seller info if provided
    if (req.body.sellerInfo) {
      user.sellerInfo = { ...user.sellerInfo, ...req.body.sellerInfo };
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: user.toPublicProfile(),
    });
  } catch (error) {
    next(error);
  }
}

// ────────────────────────────────────────────────────────────────
// 3. UPLOAD AVATAR - Upload user's profile picture
// ────────────────────────────────────────────────────────────────
/**
 * POST /api/users/avatar
 * Uploads and sets the user's avatar.
 * Protected route. Accepts multipart/form-data with 'avatar' field.
 */
export async function uploadAvatar(req, res, next) {
  try {
    console.log("Upload avatar request received");
    console.log("req.file:", req.file);
    console.log("req.user:", req.user?._id);
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided.",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured()) {
      console.error("Cloudinary not configured");
      return res.status(503).json({
        success: false,
        message: "Image upload service is not configured. Please contact support.",
      });
    }

    // Delete old avatar from Cloudinary if exists
    if (user.avatar && user.avatar.includes('cloudinary')) {
      try {
        const publicId = user.avatar.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`chequemart/avatars/${publicId}`);
      } catch (deleteError) {
        console.error("Failed to delete old avatar:", deleteError);
      }
    }

    console.log("Uploading to Cloudinary...");
    // Upload new avatar to Cloudinary
    const result = await uploadBufferToCloudinary(req.file.buffer, {
      public_id: `avatar-${user._id}`,
    }).catch(err => {
      console.error("Cloudinary upload error:", err);
      throw err;
    });
    console.log("Upload successful:", result.secure_url);

    // Set new avatar URL
    user.avatar = result.secure_url;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Avatar uploaded successfully.",
      user: user.toPublicProfile(),
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload avatar. Please try again.",
    });
  }
}

// ────────────────────────────────────────────────────────────────
// 4. DELETE AVATAR - Remove user's profile picture
// ────────────────────────────────────────────────────────────────
/**
 * DELETE /api/users/avatar
 * Deletes the user's avatar.
 * Protected route.
 */
export async function deleteAvatar(req, res, next) {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Delete from Cloudinary if exists
    if (user.avatar && user.avatar.includes('cloudinary')) {
      try {
        const publicId = user.avatar.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`chequemart/avatars/${publicId}`);
      } catch (deleteError) {
        console.error("Failed to delete avatar:", deleteError);
      }
    }

    // Clear avatar
    user.avatar = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Avatar deleted successfully.",
      user: user.toPublicProfile(),
    });
  } catch (error) {
    next(error);
  }
}

// ────────────────────────────────────────────────────────────────
// 5. CHANGE PASSWORD - Change user's password
// ────────────────────────────────────────────────────────────────
/**
 * PUT /api/users/password
 * Changes the user's password.
 * Body: { currentPassword, newPassword }
 */
export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters.",
      });
    }

    const user = await User.findById(req.user._id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate all sessions
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully. Please log in again.",
    });
  } catch (error) {
    next(error);
  }
}
