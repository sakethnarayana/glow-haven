import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

import AuthUser from "../models/AuthUser.js"; 
import User from "../models/User.js"; // The OLD schema used for roles

dotenv.config();
const router = express.Router();

// Helper: Generate JWT
const createToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      phone: user.phone,
      role: user.role, // Use the determined role
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Helper: Standard Response format
const sendResponse = (res, statusCode, success, message, data = null) => {
  const response = { success, message };
  if (data) response.data = data;
  res.status(statusCode).json(response);
};

// =========================================
// 🟢 REGISTER (phone + name + password)
// =========================================
router.post("/register", async (req, res) => {
  try {
    const { phone, name, password } = req.body;

    if (!phone || !name || !password) {
      return sendResponse(res, 400, false, "Phone, name, and password are required.");
    }

    const existingAuthUser = await AuthUser.findOne({ phone });
    if (existingAuthUser) {
      return sendResponse(res, 409, false, "User already exists with this phone number.");
    }

    // 1. Check OLD User table for existing role
    const oldUser = await User.findOne({ phone });
    // Default role is 'user'. If found in the old table, use its role.
    const initialRole = oldUser ? oldUser.role : "user"; 

    // 2. Create new Auth User with the determined role
    const authUser = await AuthUser.create({ 
        phone, 
        name, 
        password,
        role: initialRole // Assign role here
    });

    // 3. Sync/Update into OLD user schema (ensuring consistency)
    await User.findOneAndUpdate(
      { phone },
      { phone, name, role: initialRole },
      { upsert: true }
    );

    const oldusercheck=User.findOne({phone});

    // Note: The response is updated to reflect the assigned role.
    return sendResponse(res, 201, true, "Registration successful! Please login.", {
      user: {
        id: oldusercheck._id,
        phone: oldusercheck.phone,
        name: oldusercheck.name,
        role: oldusercheck.role, // Return the assigned role
      },
    });

  } catch (err) {
    console.error("Register Error:", err);
    return sendResponse(res, 500, false, "Server error during registration.");
  }
});

// =========================================
// 🟢 LOGIN (phone + password)
// =========================================
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || phone.trim().length === 0) {
      return sendResponse(res, 400, false, "Phone number is required");
    }
    if (!password || password.trim().length === 0) {
      return sendResponse(res, 400, false, "Password is required");
    }

    // 1. Find User in Auth Table
    const authUser = await AuthUser.findOne({ phone });
    if (!authUser) {
      return sendResponse(res, 404, false, "Number not registered. Please Register first.");
    }

    // 2. Check Password
    const isMatch = await bcrypt.compare(password, authUser.password);
    if (!isMatch) {
      return sendResponse(res, 401, false, "Invalid Phone or Password");
    }

    // 3. Check Role in OLD User Table (Source of truth for permission)
    const oldUser = await User.findOne({ phone });

    // Use the role from the old User table if available, otherwise default to the role in AuthUser.
    // This is the core logic to identify admin/user role.
    const determinedRole = oldUser ? oldUser.role : authUser.role; 

    // Update AuthUser role in case of mismatch (optional, for future consistency)
    if (authUser.role !== determinedRole) {
        authUser.role = determinedRole;
        await authUser.save();
    }

    // 4. Generate Token using the determined role
    const token = createToken(oldUser);

    const x = await User.findOne({phone});

    // 5. Success Response
    return sendResponse(res, 200, true, `Login successful. Role: ${determinedRole}`, {
      user: {
        _id: x._id,
        phone: authUser.phone,
        name: authUser.name,
        role: determinedRole, // Return the determined role
      },
      token,
    });

  } catch (err) {
    console.error("Login Error:", err);
    return sendResponse(res, 500, false, "Server error during login.");
  }
});

export default router;