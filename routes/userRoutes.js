import express from "express";
import User from "../models/User.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";
import Order from "../models/Order.js";
import Service from "../models/Service.js";
import Booking from "../models/Booking.js";

const router = express.Router();

/**
 * 🧩 CREATE a new user
 * Accessible by anyone (signup or onboarding)
 */
router.post("/", async (req, res) => {
  try {
    const { phone, name, role } = req.body;

    if (!phone || !name) {
      return res.status(400).json({ message: "Phone and name are required." });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(409).json({ message: "User with this phone already exists." });
    }

    const user = await User.create({ phone, name, role });
    res.status(201).json({
      message: "User created successfully.",
      user: {
      userId:user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Create User Error:", error);
    res.status(500).json({ message: "Server error while creating user." });
  }
});

// GET /users/:id/summary (Admin only)
router.get("/:id/summary", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const [orderCount, bookingCount] = await Promise.all([
      Order.countDocuments({ userId }),
      Booking.countDocuments({ userId }), // if you have Booking model
    ]);

    const lastOrder = await Order.findOne({ userId })
      .sort({ createdAt: -1 })
      .select("createdAt totalAmount status");

    res.status(200).json({
      success: true,
      message: "User summary fetched successfully",
      data: {
        orderCount,
        bookingCount,
        lastOrder,
      },
    });
  } catch (error) {
    console.error("❌ User Summary Error:", error);
    res.status(500).json({ success: false, message: "Server error while fetching summary" });
  }
});


/**
 * 📄 GET all users — Admin only
 */
router.get("/", verifyToken, verifyAdmin, async (req, res) => {
  try {
    // Fetch only users with role = "user"
    const users = await User.find({ role: "user" })
      .sort({ createdAt: -1 })
      .select("-__v");

    res.json({
      total: users.length,
      users,
    });
  } catch (error) {
    console.error("Get Users Error:", error);
    res.status(500).json({ message: "Server error while fetching users." });
  }
});
/**
 * 🔍 GET single user by _id
 */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-__v");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(user);
  } catch (error) {
    console.error("Get User Error:", error);
    res.status(500).json({ message: "Server error while fetching user." });
  }
});

/**
 * ✏️ UPDATE user — Admin or self
 */
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Only admins or the same user can update their profile
    if (req.user.role !== "admin" && req.user._id.toString() !== id) {
      return res.status(403).json({ message: "Access denied: Unauthorized action." });
    }

    const { name, role } = req.body;

    // Only admins can change roles
    const updateData = req.user.role === "admin" ? { name, role } : { name };

    const updated = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-__v");

    if (!updated) return res.status(404).json({ message: "User not found." });

    res.json({
      message: "User updated successfully.",
      user: updated,
    });
  } catch (error) {
    console.error("Update User Error:", error);
    res.status(500).json({ message: "Server error while updating user." });
  }
});

/**
 * 🗑️ DELETE user — Admin only
 */
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "User not found." });
    res.json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("Delete User Error:", error);
    res.status(500).json({ message: "Server error while deleting user." });
  }
});

export default router;
