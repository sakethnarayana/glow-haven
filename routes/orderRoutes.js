import express from "express";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Address from "../models/Address.js";
import User from "../models/User.js";

import {verifyToken} from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";

import mongoose from "mongoose";

const router = express.Router();


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
 * Validate order input
 */
const validateOrderInput = async (body) => {
  const errors = [];

  if (!body.userId || body.userId.trim().length === 0) {
    errors.push("userId is required");
  } else if (!isValidObjectId(body.userId)) {
    errors.push("Invalid userId format");
  } else {
    const userExists = await User.findById(body.userId);
    if (!userExists) {
      errors.push("User not found");
    }
  }

  if (!body.addressId || body.addressId.trim().length === 0) {
    errors.push("addressId is required");
  } else if (!isValidObjectId(body.addressId)) {
    errors.push("Invalid addressId format");
  } else {
    const addressExists = await Address.findById(body.addressId);
    if (!addressExists) {
      errors.push("Address not found");
    }
  }

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    errors.push("Items array is required and must not be empty");
  } else {
    for (const item of body.items) {
      if (!item.productId || !isValidObjectId(item.productId)) {
        errors.push(`Invalid product ID in items: ${item.productId}`);
        continue;
      }
      if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1) {
        errors.push("Each item must have quantity >= 1");
      }
      if (!item.price || typeof item.price !== "number" || item.price < 0) {
        errors.push("Each item must have valid price");
      }
    }
  }

  if (body.paymentMethod && !["cod", "online"].includes(body.paymentMethod)) {
    errors.push("Payment method must be 'cod' or 'online'");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// ============================================
// ➕ CREATE NEW ORDER — Authenticated users
// ============================================
router.post("/", verifyToken, async (req, res) => {
  try {
    const { userId, addressId, items, paymentMethod } = req.body;

    // Verify user is creating order for themselves (or admin can create for anyone)
    if (req.user.role !== "admin" && req.user._id.toString() !== userId) {
      return sendResponse(res, 403, false, "You can only create orders for yourself");
    }

    // Validate input
    const validation = await validateOrderInput(req.body);
    if (!validation.isValid) {
      return sendResponse(res, 400, false, validation.errors.join(", "));
    }

    // Verify address belongs to user
    const address = await Address.findOne({
      _id: addressId,
      userId: userId,
    });

    if (!address) {
      return sendResponse(res, 400, false, "Address does not belong to this user");
    }

    // Check stock and prepare items with details
    const preparedItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        return sendResponse(res, 404, false, `Product not found: ${item.productId}`);
      }

      if (product.stock < item.quantity) {
        return sendResponse(
          res,
          400,
          false,
          `Insufficient stock for ${product.name}. Available: ${product.stock}`
        );
      }

      const subtotal = item.price * item.quantity;
      preparedItems.push({
        productId: item.productId,
        name: product.name,
        price: item.price,
        quantity: item.quantity,
        subtotal,
      });

      totalAmount += subtotal;
    }

    // Create order
    const newOrder = new Order({
      userId,
      addressId,
      items: preparedItems,
      totalAmount,
      paymentMethod: paymentMethod || "cod",
      paymentStatus: "unpaid",
      status: "pending",
    });

    const savedOrder = await newOrder.save();

    // Reduce product stock
    for (const item of preparedItems) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: -item.quantity } },
        { new: true }
      );
    }

    // Populate references for response
    await savedOrder.populate([
      { path: "userId", select: "name phone" },
      { path: "addressId" },
    ]);

    sendResponse(res, 201, true, "Order created successfully", savedOrder);
  } catch (error) {
    console.error("❌ Create Order Error:", error);
    sendResponse(res, 500, false, "Server error while creating order");
  }
});

// ============================================
// 📄 GET ALL ORDERS — Admin only (with pagination & filters)
// ============================================
router.get("/", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};

    // Filter by order status
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // Filter by payment status
    if (req.query.paymentStatus) {
      filter.paymentStatus = req.query.paymentStatus;
    }

    // Filter by payment method
    if (req.query.paymentMethod) {
      filter.paymentMethod = req.query.paymentMethod;
    }

    // Filter by date range
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) {
        filter.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filter.createdAt.$lte = new Date(req.query.endDate);
      }
    }

    // Filter by price range
    if (req.query.minAmount || req.query.maxAmount) {
      filter.totalAmount = {};
      if (req.query.minAmount) {
        filter.totalAmount.$gte = parseFloat(req.query.minAmount);
      }
      if (req.query.maxAmount) {
        filter.totalAmount.$lte = parseFloat(req.query.maxAmount);
      }
    }

    // Execute query with pagination
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("userId", "name phone")
        .populate("addressId")
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip),
      Order.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, "Orders fetched successfully", {
      orders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get All Orders Error:", error);
    sendResponse(res, 500, false, "Server error while fetching orders");
  }
});

// ============================================
// 📄 GET USER'S ORDERS — Authenticated users
// ============================================
router.get("/my-orders", verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter = { userId: req.user._id };

    // Filter by status
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("addressId")
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip),
      Order.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, "Your orders fetched successfully", {
      orders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get My Orders Error:", error);
    sendResponse(res, 500, false, "Server error while fetching your orders");
  }
});

// ============================================
// 🔍 GET SINGLE ORDER BY ID
// ============================================
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid order ID format");
    }

    const order = await Order.findById(id)
      .populate("userId", "name phone")
      .populate("addressId");

    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    // Check authorization (user can view own orders, admin can view all)
    if (req.user.role !== "admin" && req.user._id.toString() !== order.userId._id.toString()) {
      return sendResponse(res, 403, false, "You can only view your own orders");
    }

    sendResponse(res, 200, true, "Order fetched successfully", order);
  } catch (error) {
    console.error("❌ Get Order Error:", error);
    sendResponse(res, 500, false, "Server error while fetching order");
  }
});

// ============================================
// ✏️ UPDATE ORDER STATUS — Admin only
// ============================================
router.put("/:id/status", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid order ID format");
    }

    if (!status && !paymentStatus) {
      return sendResponse(res, 400, false, "Status or paymentStatus is required");
    }

    if (status && !["pending", "confirmed", "delivered", "cancelled","in_transit"].includes(status)) {
      return sendResponse(res, 400, false, "Invalid status value");
    }

    

    const order = await Order.findById(id);
    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

   

    // Update fields
    const updateFields = {};
    if (status) updateFields.status = status;
    if (paymentStatus) updateFields.paymentStatus = paymentStatus;

    const updatedOrder = await Order.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    })
      .populate("userId", "name phone")
      .populate("addressId");

    sendResponse(res, 200, true, "Order updated successfully", updatedOrder);
  } catch (error) {
    console.error("❌ Update Order Error:", error);
    sendResponse(res, 500, false, "Server error while updating order");
  }
});

// ============================================
// ✏️ UPDATE PAYMENT STATUS — Admin only
// ============================================
router.put("/:id/payment", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, paymentMethod } = req.body;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid order ID format");
    }

    if (!paymentStatus) {
      return sendResponse(res, 400, false, "Payment status is required");
    }

    if (!["unpaid", "paid", "refunded"].includes(paymentStatus)) {
      return sendResponse(res, 400, false, "Invalid payment status value");
    }

    const order = await Order.findById(id);
    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    const updateFields = { paymentStatus };
    if (paymentMethod) {
      if (!["cod", "online"].includes(paymentMethod)) {
        return sendResponse(res, 400, false, "Invalid payment method");
      }
      updateFields.paymentMethod = paymentMethod;
    }

    const updatedOrder = await Order.findByIdAndUpdate(id, updateFields, {
      new: true,
    })
      .populate("userId", "name phone")
      .populate("addressId");

    sendResponse(res, 200, true, "Payment status updated successfully", updatedOrder);
  } catch (error) {
    console.error("❌ Update Payment Error:", error);
    sendResponse(res, 500, false, "Server error while updating payment");
  }
});

// ============================================
// 🗑️ CANCEL ORDER — User or Admin
// ============================================
router.put("/:id/cancel", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid order ID format");
    }

    const order = await Order.findById(id);
    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user._id.toString() !== order.userId.toString()) {
      return sendResponse(res, 403, false, "You can only cancel your own orders");
    }

    // Check if order can be cancelled
    if (order.status === "delivered") {
      return sendResponse(res, 400, false, "Cannot cancel a delivered order");
    }

    if (order.status === "cancelled") {
      return sendResponse(res, 400, false, "Order is already cancelled");
    }

    // Restore product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: item.quantity } },
        { new: true }
      );
    }

    // Update order status
    const cancelledOrder = await Order.findByIdAndUpdate(
      id,
      { status: "cancelled" },
      { new: true }
    )
      .populate("userId", "name phone")
      .populate("addressId");

    sendResponse(res, 200, true, "Order cancelled successfully", cancelledOrder);
  } catch (error) {
    console.error("❌ Cancel Order Error:", error);
    sendResponse(res, 500, false, "Server error while cancelling order");
  }
});

// ============================================
// 📊 GET ORDER STATISTICS — Admin only
// ============================================
router.get("/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const stats = await Order.aggregate([
      {
        $facet: {
          totalOrders: [{ $count: "count" }],
          totalRevenue: [
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ],
          averageOrderValue: [
            { $group: { _id: null, average: { $avg: "$totalAmount" } } },
          ],
          byStatus: [
            { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$totalAmount" } } },
            { $sort: { count: -1 } },
          ],
          byPaymentStatus: [
            { $group: { _id: "$paymentStatus", count: { $sum: 1 }, total: { $sum: "$totalAmount" } } },
          ],
          byPaymentMethod: [
            { $group: { _id: "$paymentMethod", count: { $sum: 1 }, total: { $sum: "$totalAmount" } } },
          ],
          recentOrders: [
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            {
              $project: {
                userId: 1,
                totalAmount: 1,
                status: 1,
                paymentStatus: 1,
                createdAt: 1,
              },
            },
          ],
          ordersByDate: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                count: { $sum: 1 },
                revenue: { $sum: "$totalAmount" },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 30 },
          ],
        },
      },
    ]);

    sendResponse(res, 200, true, "Order statistics fetched successfully", stats[0]);
  } catch (error) {
    console.error("❌ Stats Error:", error);
    sendResponse(res, 500, false, "Server error while fetching statistics");
  }
});

// ============================================
// 📊 GET SALES REPORT — Admin only
// ============================================
router.get("/admin/sales-report", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    const report = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $ne: "cancelled" },
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$totalAmount" },
                avgOrderValue: { $avg: "$totalAmount" },
                completedOrders: {
                  $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
                },
                paidOrders: {
                  $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
                },
              },
            },
          ],
          topProducts: [
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.productId",
                name: { $first: "$items.name" },
                totalQuantity: { $sum: "$items.quantity" },
                totalRevenue: { $sum: "$items.subtotal" },
                orderCount: { $sum: 1 },
              },
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 },
          ],
          dailyRevenue: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                revenue: { $sum: "$totalAmount" },
                orders: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    sendResponse(res, 200, true, "Sales report generated successfully", report[0]);
  } catch (error) {
    console.error("❌ Sales Report Error:", error);
    sendResponse(res, 500, false, "Server error while generating sales report");
  }
});

export default router;
