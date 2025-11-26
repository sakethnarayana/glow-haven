import express from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/User.js";
import { verifyToken } from "../middleware/authMiddleware.js";

dotenv.config();
const router = express.Router();

// Temporary OTP store (replace with Redis or DB later)
const otpStore = new Map();
const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes

// ============================================
// 🛠️ UTILITY FUNCTIONS
// ============================================

/**
 * Generate random 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Standard response formatter
 */
const sendResponse = (res, statusCode, success, message, data = null) => {
  const response = { success, message };
  if (data) response.data = data;
  res.status(statusCode).json(response);
};

/**
 * Validate phone format (10-15 digits with optional +)
 */
const isValidPhone = (phone) => {
  return /^\+?\d{10,15}$/.test(phone);
};

// ============================================
// ✅ CHECK IF PHONE EXISTS
// ============================================
router.post("/check-phone", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.trim().length === 0) {
      return sendResponse(res, 400, false, "Phone number is required");
    }

    const trimmedPhone = phone.trim();

    if (!isValidPhone(trimmedPhone)) {
      return sendResponse(res, 400, false, "Invalid phone number format");
    }

    // Check if user exists
    const user = await User.findOne({ phone: trimmedPhone });
    const exists = !!user;

    sendResponse(res, 200, true, "Phone status checked", {
      phone: trimmedPhone,
      exists,
      user: exists
        ? {
            id: user._id,
            name: user.name,
            role: user.role,
          }
        : null,
    });
  } catch (error) {
    console.error("❌ Check Phone Error:", error);
    sendResponse(res, 500, false, "Server error while checking phone");
  }
});

// ============================================
// 📱 SEND OTP
// ============================================
router.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.trim().length === 0) {
      return sendResponse(res, 400, false, "Phone number is required");
    }

    const trimmedPhone = phone.trim();

    if (!isValidPhone(trimmedPhone)) {
      return sendResponse(res, 400, false, "Invalid phone number format (10-15 digits)");
    }

    // Generate OTP
    const otp = process.env.NODE_ENV === "production" 
      ? generateOTP() 
      : "123456"; // Mock OTP for testing

    // Store OTP with expiry
    otpStore.set(trimmedPhone, {
      otp,
      timestamp: Date.now(),
      attempts: 0,
    });

    // Auto-delete OTP after 5 minutes
    setTimeout(() => {
      otpStore.delete(trimmedPhone);
    }, OTP_EXPIRY);

    console.log(`✅ OTP sent to ${trimmedPhone}: ${otp}`);

    sendResponse(res, 200, true, "OTP sent successfully", {
      phone: trimmedPhone,
      expiresIn: 300, // seconds
      demo: process.env.NODE_ENV !== "production" ? "Use 123456 for testing" : undefined,
    });
  } catch (error) {
    console.error("❌ Send OTP Error:", error);
    sendResponse(res, 500, false, "Server error while sending OTP");
  }
});

// ============================================
// ✔️ VERIFY OTP (NEW - Without auto user creation)
// ============================================
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || phone.trim().length === 0) {
      return sendResponse(res, 400, false, "Phone number is required");
    }

    if (!otp || otp.trim().length === 0) {
      return sendResponse(res, 400, false, "OTP is required");
    }

    const trimmedPhone = phone.trim();
    const trimmedOtp = otp.trim();

    if (!isValidPhone(trimmedPhone)) {
      return sendResponse(res, 400, false, "Invalid phone number format");
    }

    if (!/^\d{6}$/.test(trimmedOtp)) {
      return sendResponse(res, 400, false, "OTP must be 6 digits");
    }

    // Check if OTP exists
    const otpData = otpStore.get(trimmedPhone);
    if (!otpData) {
      return sendResponse(res, 400, false, "OTP expired or not sent. Please request a new OTP");
    }

    // Check OTP expiry
    if (Date.now() - otpData.timestamp > OTP_EXPIRY) {
      otpStore.delete(trimmedPhone);
      return sendResponse(res, 400, false, "OTP has expired. Please request a new OTP");
    }

    // Check OTP validity (max 3 attempts)
    if (otpData.attempts >= 3) {
      otpStore.delete(trimmedPhone);
      return sendResponse(res, 400, false, "Too many failed attempts. Please request a new OTP");
    }

    // Verify OTP
    if (otpData.otp !== trimmedOtp) {
      otpData.attempts += 1;
      return sendResponse(res, 401, false, "Invalid OTP");
    }

    // OTP is correct - check if user exists
    let user = await User.findOne({ phone: trimmedPhone });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      // ✅ FIX: Don't create user here - create only when name is provided
      // Just return a temporary token for name setup
    } else {
      // Existing user - check if has name
      if (!user.name || !user.name.trim()) {
        isNewUser = true; // Treat as "needs to complete profile"
      }
    }

    // Create temporary JWT for name setup (valid for 10 minutes)
    const tempToken = jwt.sign(
      {
        phone: trimmedPhone,
        tempAuth: true, // Mark as temporary
      },
      process.env.JWT_SECRET || "your-secret-key-change-in-production",
      { expiresIn: "10m" }
    );

    // Delete OTP after successful verification
    otpStore.delete(trimmedPhone);

    // Response
    if (isNewUser) {
      // New user or incomplete profile - ask for name
      sendResponse(res, 201, true, "OTP verified. Please provide your name", {
        phone: trimmedPhone,
        tempToken, // Temporary token to call set-name
        isNewUser: true,
        user: user ? {
          _id: user._id,
          phone: user.phone,
          name: user.name || "",
          role: user.role,
        } : null,
      });
    } else {
      // Existing user with name - create permanent token and login
      const token = jwt.sign(
        {
          id: user._id,
          phone: user.phone,
          role: user.role,
        },
        process.env.JWT_SECRET || "your-secret-key-change-in-production",
        { expiresIn: "7d" }
      );

      sendResponse(res, 200, true, "Login successful", {
        user: {
          _id: user._id,
          phone: user.phone,
          name: user.name,
          role: user.role,
        },
        token, // Permanent token
        isNewUser: false,
      });
    }
  } catch (error) {
    console.error("❌ Verify OTP Error:", error);
    sendResponse(res, 500, false, "Server error while verifying OTP");
  }
});

// ============================================
// 📝 SET NAME (For new users - FIXED)
// ============================================
router.post("/set-name", verifyToken, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return sendResponse(res, 400, false, "Name is required");
    }

    if (name.trim().length < 2) {
      return sendResponse(res, 400, false, "Name must be at least 2 characters");
    }

    if (name.trim().length > 100) {
      return sendResponse(res, 400, false, "Name must not exceed 100 characters");
    }

    // Get phone from token
    const phone = req.user.phone;
    if (!phone) {
      return sendResponse(res, 400, false, "Invalid token - phone not found");
    }

    // ✅ FIX: First check if user exists
    let user = await User.findOne({ phone });

    if (!user) {
      // ✅ FIX: Create user with name (not with empty name)
      user = new User({
        phone,
        name: name.trim(),
        role: "user",
      });
      await user.save();
    } else {
      // Update existing user's name
      user.name = name.trim();
      await user.save();
    }

    // Create permanent JWT token
    const token = jwt.sign(
      {
        id: user._id,
        phone: user.phone,
        role: user.role,
      },
      process.env.JWT_SECRET || "your-secret-key-change-in-production",
      { expiresIn: "7d" }
    );

    sendResponse(res, 200, true, "Profile completed successfully", {
      user: {
        _id: user._id,
        phone: user.phone,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error("❌ Set Name Error:", error);
    sendResponse(res, 500, false, "Server error while setting name");
  }
});

// ============================================
// 🔄 GET CURRENT USER
// ============================================
router.get("/me", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId).select("_id name phone role");

    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    sendResponse(res, 200, true, "User fetched successfully", user);
  } catch (error) {
    console.error("❌ Get User Error:", error);
    sendResponse(res, 500, false, "Server error while fetching user");
  }
});

// ============================================
// 🚪 LOGOUT (Optional - frontend can just delete token)
// ============================================
router.post("/logout", verifyToken, async (req, res) => {
  try {
    // Optional: Invalidate token on backend (requires token blacklist DB)
    // For now, just confirm logout
    sendResponse(res, 200, true, "Logged out successfully");
  } catch (error) {
    console.error("❌ Logout Error:", error);
    sendResponse(res, 500, false, "Server error while logging out");
  }
});

export default router;