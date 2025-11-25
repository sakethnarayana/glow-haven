import express from "express";
import Address from "../models/Address.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";

import mongoose from "mongoose";

const router = express.Router();

// ============================================
// 🛠️ UTILITY FUNCTIONS
// ============================================

/**
 * Validate MongoDB ObjectId
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id) && 
         String(new mongoose.Types.ObjectId(id)) === id;
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
 * Validate phone number
 */
const isValidPhone = (phone) => {
  return /^\+?\d{10,15}$/.test(phone);
};

/**
 * Validate pincode
 */
const isValidPincode = (pincode) => {
  return /^\d{5,10}$/.test(pincode);
};

/**
 * Validate address input
 */
const validateAddressInput = async (body, userId) => {
  const errors = [];

  if (!body.addressLine || body.addressLine.trim().length === 0) {
    errors.push("Address line is required");
  } else if (body.addressLine.trim().length < 5) {
    errors.push("Address line must be at least 5 characters");
  } else if (body.addressLine.trim().length > 255) {
    errors.push("Address line must not exceed 255 characters");
  }

  if (!body.city || body.city.trim().length === 0) {
    errors.push("City is required");
  } else if (body.city.trim().length < 2) {
    errors.push("City must be at least 2 characters");
  } else if (body.city.trim().length > 100) {
    errors.push("City must not exceed 100 characters");
  }

  if (!body.state || body.state.trim().length === 0) {
    errors.push("State is required");
  } else if (body.state.trim().length < 2) {
    errors.push("State must be at least 2 characters");
  } else if (body.state.trim().length > 100) {
    errors.push("State must not exceed 100 characters");
  }

  if (!body.pincode || body.pincode.trim().length === 0) {
    errors.push("Pincode is required");
  } else if (!isValidPincode(body.pincode)) {
    errors.push("Pincode must be 5-10 digits");
  }

  if (body.phone && body.phone.trim().length > 0) {
    if (!isValidPhone(body.phone)) {
      errors.push("Phone must be 10-15 digits with optional +");
    }
  }

  if (body.recipientName && body.recipientName.trim().length > 0) {
    if (body.recipientName.trim().length < 2) {
      errors.push("Recipient name must be at least 2 characters");
    } else if (body.recipientName.trim().length > 100) {
      errors.push("Recipient name must not exceed 100 characters");
    }
  }

  if (body.label && body.label.trim().length > 0) {
    if (body.label.trim().length > 50) {
      errors.push("Label must not exceed 50 characters");
    }
  }

  if (body.landmark && body.landmark.trim().length > 100) {
    errors.push("Landmark must not exceed 100 characters");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// ============================================
// ➕ CREATE NEW ADDRESS — Authenticated users
// ============================================
router.post("/", verifyToken, async (req, res) => {
  try {
    const { label, recipientName, phone, addressLine, landmark, pincode, city, state, isDefault } = req.body;
    const userId = req.user._id;

    // Validate input
    const validation = await validateAddressInput(req.body, userId);
    if (!validation.isValid) {
      return sendResponse(res, 400, false, validation.errors.join(", "));
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    // If marking as default, unset other defaults
    if (isDefault) {
      await Address.updateMany(
        { userId },
        { isDefault: false }
      );
    }

    // Create new address
    const newAddress = new Address({
      userId,
      label: label?.trim() || "",
      recipientName: recipientName?.trim() || "",
      phone: phone?.trim() || "",
      addressLine: addressLine.trim(),
      landmark: landmark?.trim() || "",
      pincode: pincode.trim(),
      city: city.trim(),
      state: state.trim(),
      isDefault: isDefault || false,
    });

    const savedAddress = await newAddress.save();

    sendResponse(res, 201, true, "Address created successfully", savedAddress);
  } catch (error) {
    console.error("❌ Create Address Error:", error);
    sendResponse(res, 500, false, "Server error while creating address");
  }
});

// ============================================
// 📄 GET USER'S ADDRESSES — Authenticated users
// ============================================
router.get("/my-addresses", verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter = { userId: req.user._id };

    // Filter by label
    if (req.query.label) {
      filter.label = new RegExp(req.query.label.trim(), "i");
    }

    // Filter by default
    if (req.query.isDefault === "true") {
      filter.isDefault = true;
    }

    const [addresses, total] = await Promise.all([
      Address.find(filter)
        .sort({ isDefault: -1, createdAt: -1 })
        .limit(limit)
        .skip(skip),
      Address.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, "Your addresses fetched successfully", {
      addresses,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get My Addresses Error:", error);
    sendResponse(res, 500, false, "Server error while fetching addresses");
  }
});

// ============================================
// 📄 GET ALL ADDRESSES — Admin only
// ============================================
router.get("/", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};

    // Filter by user
    if (req.query.userId) {
      if (!isValidObjectId(req.query.userId)) {
        return sendResponse(res, 400, false, "Invalid userId format");
      }
      filter.userId = req.query.userId;
    }

    // Filter by city
    if (req.query.city) {
      filter.city = new RegExp(`^${req.query.city.trim()}$`, "i");
    }

    // Filter by state
    if (req.query.state) {
      filter.state = new RegExp(`^${req.query.state.trim()}$`, "i");
    }

    // Filter by pincode
    if (req.query.pincode) {
      filter.pincode = req.query.pincode.trim();
    }

    // Filter by default
    if (req.query.isDefault === "true") {
      filter.isDefault = true;
    }

    const [addresses, total] = await Promise.all([
      Address.find(filter)
        .populate("userId", "name phone")
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip),
      Address.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, "Addresses fetched successfully", {
      addresses,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get All Addresses Error:", error);
    sendResponse(res, 500, false, "Server error while fetching addresses");
  }
});

// ============================================
// 🔍 GET SINGLE ADDRESS BY ID
// ============================================
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid address ID format");
    }

    const address = await Address.findById(id);

    if (!address) {
      return sendResponse(res, 404, false, "Address not found");
    }

    // Check authorization (user can view own addresses, admin can view all)
    if (req.user.role !== "admin" && req.user._id.toString() !== address.userId.toString()) {
      return sendResponse(res, 403, false, "You can only view your own addresses");
    }

    sendResponse(res, 200, true, "Address fetched successfully", address);
  } catch (error) {
    console.error("❌ Get Address Error:", error);
    sendResponse(res, 500, false, "Server error while fetching address");
  }
});

// ============================================
// ✏️ UPDATE ADDRESS — Authenticated users
// ============================================
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid address ID format");
    }

    const address = await Address.findById(id);
    if (!address) {
      return sendResponse(res, 404, false, "Address not found");
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user._id.toString() !== address.userId.toString()) {
      return sendResponse(res, 403, false, "You can only update your own addresses");
    }

    // Validate input (allow partial updates)
    if (Object.keys(req.body).length > 0) {
      const validation = await validateAddressInput(req.body, address.userId);
      if (!validation.isValid) {
        return sendResponse(res, 400, false, validation.errors.join(", "));
      }
    }

    // Build update object
    const updateFields = {};
    if (req.body.label !== undefined) updateFields.label = req.body.label?.trim() || "";
    if (req.body.recipientName !== undefined) updateFields.recipientName = req.body.recipientName?.trim() || "";
    if (req.body.phone !== undefined) updateFields.phone = req.body.phone?.trim() || "";
    if (req.body.addressLine !== undefined) updateFields.addressLine = req.body.addressLine.trim();
    if (req.body.landmark !== undefined) updateFields.landmark = req.body.landmark?.trim() || "";
    if (req.body.pincode !== undefined) updateFields.pincode = req.body.pincode.trim();
    if (req.body.city !== undefined) updateFields.city = req.body.city.trim();
    if (req.body.state !== undefined) updateFields.state = req.body.state.trim();
    if (req.body.isDefault !== undefined) updateFields.isDefault = req.body.isDefault;

    // If marking as default, unset other defaults for this user
    if (req.body.isDefault === true) {
      await Address.updateMany(
        { userId: address.userId, _id: { $ne: id } },
        { isDefault: false }
      );
    }

    const updatedAddress = await Address.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    });

    sendResponse(res, 200, true, "Address updated successfully", updatedAddress);
  } catch (error) {
    console.error("❌ Update Address Error:", error);
    sendResponse(res, 500, false, "Server error while updating address");
  }
});

// ============================================
// 🔄 SET ADDRESS AS DEFAULT — Authenticated users
// ============================================
router.put("/:id/set-default", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid address ID format");
    }

    const address = await Address.findById(id);
    if (!address) {
      return sendResponse(res, 404, false, "Address not found");
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user._id.toString() !== address.userId.toString()) {
      return sendResponse(res, 403, false, "You can only set your own addresses as default");
    }

    // Unset all other defaults for this user
    await Address.updateMany(
      { userId: address.userId, _id: { $ne: id } },
      { isDefault: false }
    );

    // Set this as default
    const updatedAddress = await Address.findByIdAndUpdate(
      id,
      { isDefault: true },
      { new: true }
    );

    sendResponse(res, 200, true, "Address set as default successfully", updatedAddress);
  } catch (error) {
    console.error("❌ Set Default Address Error:", error);
    sendResponse(res, 500, false, "Server error while setting default address");
  }
});

// ============================================
// 🗑️ DELETE ADDRESS — Authenticated users (with order check)
// ============================================
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid address ID format");
    }

    const address = await Address.findById(id);
    if (!address) {
      return sendResponse(res, 404, false, "Address not found");
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user._id.toString() !== address.userId.toString()) {
      return sendResponse(res, 403, false, "You can only delete your own addresses");
    }

    // Check if address is used in active orders
    const activeOrdersWithAddress = await Order.countDocuments({
      addressId: id,
      status: { $in: ["pending", "confirmed"] },
    });

    if (activeOrdersWithAddress > 0) {
      return sendResponse(
        res,
        400,
        false,
        `Cannot delete address. ${activeOrdersWithAddress} active order(s) use this address.`
      );
    }

    // Delete address
    await Address.findByIdAndDelete(id);

    // If deleted address was default, set another as default
    const remainingAddresses = await Address.find({ userId: address.userId });
    if (remainingAddresses.length > 0 && !remainingAddresses.some((a) => a.isDefault)) {
      await Address.findByIdAndUpdate(
        remainingAddresses[0]._id,
        { isDefault: true }
      );
    }

    sendResponse(res, 200, true, "Address deleted successfully");
  } catch (error) {
    console.error("❌ Delete Address Error:", error);
    sendResponse(res, 500, false, "Server error while deleting address");
  }
});

// ============================================
// 📊 GET ADDRESS STATISTICS — Admin only
// ============================================
router.get("/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const stats = await Address.aggregate([
      {
        $facet: {
          totalAddresses: [{ $count: "count" }],
          totalUsers: [{ $group: { _id: "$userId" } }, { $count: "count" }],
          defaultAddresses: [
            { $match: { isDefault: true } },
            { $count: "count" },
          ],
          byCity: [
            { $group: { _id: "$city", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 },
          ],
          byState: [
            { $group: { _id: "$state", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
          topPincodes: [
            { $group: { _id: "$pincode", count: { $sum: 1 }, city: { $first: "$city" } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
          addressesPerUser: [
            {
              $group: {
                _id: "$userId",
                count: { $sum: 1 },
              },
            },
            {
              $group: {
                _id: null,
                avgAddressesPerUser: { $avg: "$count" },
                maxAddressesPerUser: { $max: "$count" },
                minAddressesPerUser: { $min: "$count" },
              },
            },
          ],
          recentAddresses: [
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            {
              $project: {
                userId: 1,
                city: 1,
                state: 1,
                isDefault: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
    ]);

    sendResponse(res, 200, true, "Address statistics fetched successfully", stats[0]);
  } catch (error) {
    console.error("❌ Stats Error:", error);
    sendResponse(res, 500, false, "Server error while fetching statistics");
  }
});

// ============================================
// 📊 GET ADDRESSES BY LOCATION — Admin only
// ============================================
router.get("/admin/by-location", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { city, state } = req.query;

    if (!city || !state) {
      return sendResponse(res, 400, false, "City and state query parameters are required");
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter = {
      city: new RegExp(`^${city.trim()}$`, "i"),
      state: new RegExp(`^${state.trim()}$`, "i"),
    };

    const [addresses, total] = await Promise.all([
      Address.find(filter)
        .populate("userId", "name phone")
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip),
      Address.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, "Addresses fetched by location successfully", {
      location: { city, state },
      addresses,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get By Location Error:", error);
    sendResponse(res, 500, false, "Server error while fetching addresses by location");
  }
});

// ============================================
// 📊 GET DEFAULT ADDRESS — Authenticated users
// ============================================
router.get("/default", verifyToken, async (req, res) => {
  try {
    const defaultAddress = await Address.findOne({
      userId: req.user._id,
      isDefault: true,
    });

    if (!defaultAddress) {
      return sendResponse(res, 404, false, "No default address found");
    }

    sendResponse(res, 200, true, "Default address fetched successfully", defaultAddress);
  } catch (error) {
    console.error("❌ Get Default Address Error:", error);
    sendResponse(res, 500, false, "Server error while fetching default address");
  }
});

export default router;