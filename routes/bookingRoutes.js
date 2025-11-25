import express from "express";
import Booking from "../models/Booking.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import Availability from "../models/Availability.js";

import {verifyToken} from "../middleware/authMiddleware.js";
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
 * Validate date format (YYYY-MM-DD)
 */
const isValidDateFormat = (dateString) => {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateString);
};

/**
 * Validate time format (HH:mm)
 */
const isValidTimeFormat = (timeString) => {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString);
};

/**
 * Validate phone number
 */
const isValidPhone = (phone) => {
  return /^\+?\d{10,15}$/.test(phone);
};

/**
 * Validate booking input
 */
const validateBookingInput = async (body) => {
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

  if (!body.serviceId || body.serviceId.trim().length === 0) {
    errors.push("serviceId is required");
  } else if (!isValidObjectId(body.serviceId)) {
    errors.push("Invalid serviceId format");
  } else {
    const serviceExists = await Service.findById(body.serviceId);
    if (!serviceExists) {
      errors.push("Service not found");
    }
  }

  if (!body.date || body.date.trim().length === 0) {
    errors.push("Date is required");
  } else if (!isValidDateFormat(body.date)) {
    errors.push("Date must be in YYYY-MM-DD format");
  } else {
    const bookingDate = new Date(body.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDate < today) {
      errors.push("Cannot book for past dates");
    }
  }

  if (!body.time || body.time.trim().length === 0) {
    errors.push("Time is required");
  } else if (!isValidTimeFormat(body.time)) {
    errors.push("Time must be in HH:mm format (24-hour)");
  }

  if (!body.name || body.name.trim().length === 0) {
    errors.push("Name is required");
  } else if (body.name.trim().length < 2) {
    errors.push("Name must be at least 2 characters");
  } else if (body.name.trim().length > 100) {
    errors.push("Name must not exceed 100 characters");
  }

  if (!body.phone || body.phone.trim().length === 0) {
    errors.push("Phone is required");
  } else if (!isValidPhone(body.phone)) {
    errors.push("Phone must be 10-15 digits with optional +");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// ============================================
// ➕ CREATE NEW BOOKING — Authenticated users
// ============================================
router.post("/", verifyToken, async (req, res) => {
  try {
    const { userId, serviceId, date, time, name, phone } = req.body;

    // Verify user is booking for themselves (or admin can book for anyone)
    if (req.user.role !== "admin" && req.user._id.toString() !== userId) {
      return sendResponse(res, 403, false, "You can only create bookings for yourself");
    }

    // Validate input
    const validation = await validateBookingInput(req.body);
    if (!validation.isValid) {
      return sendResponse(res, 400, false, validation.errors.join(", "));
    }

    // Get service details
    const service = await Service.findById(serviceId);
    if (!service) {
      return sendResponse(res, 404, false, "Service not found");
    }

    // Check if time slot is available
    const availability = await Availability.findOne({ date });

    if (availability) {
      if (availability.isFullDayUnavailable) {
        return sendResponse(res, 400, false, "This date is not available for booking");
      }

      const isSlotUnavailable = availability.unavailableSlots.some(
        (slot) => slot.time === time
      );

      if (isSlotUnavailable) {
        return sendResponse(
          res,
          400,
          false,
          `Time slot ${time} is not available on ${date}`
        );
      }
    }

    // Check for duplicate booking (same user, date, time, not cancelled)
    const existingBooking = await Booking.findOne({
      userId,
      date,
      time,
      status: { $ne: "cancelled" },
    });

    if (existingBooking) {
      return sendResponse(
        res,
        409,
        false,
        "You already have a booking at this date and time"
      );
    }

    // Create booking
    const newBooking = new Booking({
      userId,
      serviceId,
      serviceName: service.name,
      servicePrice: service.price,
      serviceDuration: service.duration,
      date,
      time,
      name: name.trim(),
      phone: phone.trim(),
      status: "pending",
    });

    const savedBooking = await newBooking.save();

    // Populate references for response
    await savedBooking.populate([
      { path: "userId", select: "name phone" },
      { path: "serviceId", select: "name price duration" },
    ]);

    sendResponse(res, 201, true, "Booking created successfully", savedBooking);
  } catch (error) {
    console.error("❌ Create Booking Error:", error);
    sendResponse(res, 500, false, "Server error while creating booking");
  }
});

// ============================================
// 📄 GET ALL BOOKINGS — Admin only (with filters)
// ============================================
router.get("/", verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};

    // Filter by status
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // Filter by date
    if (req.query.date) {
      if (!isValidDateFormat(req.query.date)) {
        return sendResponse(res, 400, false, "Date must be in YYYY-MM-DD format");
      }
      filter.date = req.query.date;
    }

    // Filter by date range
    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) {
        if (!isValidDateFormat(req.query.startDate)) {
          return sendResponse(res, 400, false, "Start date must be in YYYY-MM-DD format");
        }
        filter.date.$gte = req.query.startDate;
      }
      if (req.query.endDate) {
        if (!isValidDateFormat(req.query.endDate)) {
          return sendResponse(res, 400, false, "End date must be in YYYY-MM-DD format");
        }
        filter.date.$lte = req.query.endDate;
      }
    }

    // Filter by service
    if (req.query.serviceId) {
      if (!isValidObjectId(req.query.serviceId)) {
        return sendResponse(res, 400, false, "Invalid serviceId format");
      }
      filter.serviceId = req.query.serviceId;
    }

    // Filter by user
    if (req.query.userId) {
      if (!isValidObjectId(req.query.userId)) {
        return sendResponse(res, 400, false, "Invalid userId format");
      }
      filter.userId = req.query.userId;
    }

    // Execute query with pagination
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate("userId", "name phone")
        .populate("serviceId", "name price duration")
        .sort({ date: 1, time: 1 })
        .limit(limit)
        .skip(skip),
      Booking.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, "Bookings fetched successfully", {
      bookings,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get All Bookings Error:", error);
    sendResponse(res, 500, false, "Server error while fetching bookings");
  }
});

// ============================================
// 📄 GET USER'S BOOKINGS — Authenticated users
// ============================================
router.get("/my-bookings", verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter = { userId: req.user._id };

    // Filter by status
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // Filter by date range
    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) {
        if (!isValidDateFormat(req.query.startDate)) {
          return sendResponse(res, 400, false, "Start date must be in YYYY-MM-DD format");
        }
        filter.date.$gte = req.query.startDate;
      }
      if (req.query.endDate) {
        if (!isValidDateFormat(req.query.endDate)) {
          return sendResponse(res, 400, false, "End date must be in YYYY-MM-DD format");
        }
        filter.date.$lte = req.query.endDate;
      }
    }

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate("serviceId", "name price duration image")
        .sort({ date: -1, time: -1 })
        .limit(limit)
        .skip(skip),
      Booking.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, "Your bookings fetched successfully", {
      bookings,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get My Bookings Error:", error);
    sendResponse(res, 500, false, "Server error while fetching your bookings");
  }
});

// ============================================
// 🔍 GET SINGLE BOOKING BY ID
// ============================================
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid booking ID format");
    }

    const booking = await Booking.findById(id)
      .populate("userId", "name phone")
      .populate("serviceId", "name price duration image");

    if (!booking) {
      return sendResponse(res, 404, false, "Booking not found");
    }

    // Check authorization (user can view own bookings, admin can view all)
    if (req.user.role !== "admin" && req.user._id.toString() !== booking.userId._id.toString()) {
      return sendResponse(res, 403, false, "You can only view your own bookings");
    }

    sendResponse(res, 200, true, "Booking fetched successfully", booking);
  } catch (error) {
    console.error("❌ Get Booking Error:", error);
    sendResponse(res, 500, false, "Server error while fetching booking");
  }
});

// ============================================
// ✏️ UPDATE BOOKING — User or Admin
// ============================================
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid booking ID format");
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return sendResponse(res, 404, false, "Booking not found");
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user._id.toString() !== booking.userId.toString()) {
      return sendResponse(res, 403, false, "You can only update your own bookings");
    }

    // Validate updates (if date/time changed)
    if (req.body.date || req.body.time) {
      const newDate = req.body.date || booking.date;
      const newTime = req.body.time || booking.time;

      if (!isValidDateFormat(newDate)) {
        return sendResponse(res, 400, false, "Date must be in YYYY-MM-DD format");
      }

      if (!isValidTimeFormat(newTime)) {
        return sendResponse(res, 400, false, "Time must be in HH:mm format");
      }

      // Check if new slot is available
      const availability = await Availability.findOne({ date: newDate });

      if (availability) {
        if (availability.isFullDayUnavailable) {
          return sendResponse(res, 400, false, "This date is not available for booking");
        }

        const isSlotUnavailable = availability.unavailableSlots.some(
          (slot) => slot.time === newTime
        );

        if (isSlotUnavailable) {
          return sendResponse(
            res,
            400,
            false,
            `Time slot ${newTime} is not available on ${newDate}`
          );
        }
      }

      // Check for duplicate (different booking at same slot)
      const existingBooking = await Booking.findOne({
        _id: { $ne: id },
        userId: booking.userId,
        date: newDate,
        time: newTime,
        status: { $ne: "cancelled" },
      });

      if (existingBooking) {
        return sendResponse(res, 409, false, "You already have a booking at this date and time");
      }
    }

    // Build update object (only allow certain fields)
    const updateFields = {};
    if (req.body.date !== undefined) updateFields.date = req.body.date;
    if (req.body.time !== undefined) updateFields.time = req.body.time;
    if (req.body.name !== undefined) updateFields.name = req.body.name.trim();
    if (req.body.phone !== undefined) {
      if (!isValidPhone(req.body.phone)) {
        return sendResponse(res, 400, false, "Invalid phone number");
      }
      updateFields.phone = req.body.phone.trim();
    }

    // Admin can update status
    if (req.user.role === "admin" && req.body.status) {
      if (!["pending", "confirmed", "completed", "cancelled"].includes(req.body.status)) {
        return sendResponse(res, 400, false, "Invalid status value");
      }
      updateFields.status = req.body.status;
    }

    const updatedBooking = await Booking.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    })
      .populate("userId", "name phone")
      .populate("serviceId", "name price duration");

    sendResponse(res, 200, true, "Booking updated successfully", updatedBooking);
  } catch (error) {
    console.error("❌ Update Booking Error:", error);
    sendResponse(res, 500, false, "Server error while updating booking");
  }
});

// ============================================
// ✏️ UPDATE BOOKING STATUS — Admin only
// ============================================
router.put("/:id/status", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid booking ID format");
    }

    if (!status) {
      return sendResponse(res, 400, false, "Status is required");
    }

    if (!["pending", "confirmed", "completed", "cancelled","in_progress"].includes(status)) {
      return sendResponse(res, 400, false, "Invalid status value");
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return sendResponse(res, 404, false, "Booking not found");
    }

    

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    )
      .populate("userId", "name phone")
      .populate("serviceId", "name price duration");

    sendResponse(res, 200, true, "Booking status updated successfully", updatedBooking);
  } catch (error) {
    console.error("❌ Update Status Error:", error);
    sendResponse(res, 500, false, "Server error while updating booking status");
  }
});

// ============================================
// 🗑️ CANCEL BOOKING — User or Admin
// ============================================
router.put("/:id/cancel", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid booking ID format");
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return sendResponse(res, 404, false, "Booking not found");
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user._id.toString() !== booking.userId.toString()) {
      return sendResponse(res, 403, false, "You can only cancel your own bookings");
    }

    // Check if booking can be cancelled
    if (booking.status === "completed") {
      return sendResponse(res, 400, false, "Cannot cancel a completed booking");
    }

    if (booking.status === "cancelled") {
      return sendResponse(res, 400, false, "Booking is already cancelled");
    }

    const cancelledBooking = await Booking.findByIdAndUpdate(
      id,
      { status: "cancelled" },
      { new: true }
    )
      .populate("userId", "name phone")
      .populate("serviceId", "name price duration");

    sendResponse(res, 200, true, "Booking cancelled successfully", cancelledBooking);
  } catch (error) {
    console.error("❌ Cancel Booking Error:", error);
    sendResponse(res, 500, false, "Server error while cancelling booking");
  }
});

// ============================================
// 🗑️ DELETE BOOKING — Admin only
// ============================================
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid booking ID format");
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return sendResponse(res, 404, false, "Booking not found");
    }

    // Only delete cancelled bookings
    if (booking.status !== "cancelled") {
      return sendResponse(res, 400, false, "Can only delete cancelled bookings");
    }

    await Booking.findByIdAndDelete(id);
    sendResponse(res, 200, true, "Booking deleted successfully");
  } catch (error) {
    console.error("❌ Delete Booking Error:", error);
    sendResponse(res, 500, false, "Server error while deleting booking");
  }
});

// ============================================
// 📊 GET BOOKING STATISTICS — Admin only
// ============================================
router.get("/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const stats = await Booking.aggregate([
      {
        $facet: {
          totalBookings: [{ $count: "count" }],
          totalRevenue: [
            { $group: { _id: null, total: { $sum: "$servicePrice" } } },
          ],
          averageBookingValue: [
            { $group: { _id: null, average: { $avg: "$servicePrice" } } },
          ],
          byStatus: [
            { $group: { _id: "$status", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          byService: [
            { $group: { _id: "$serviceName", count: { $sum: 1 }, revenue: { $sum: "$servicePrice" } } },
            { $sort: { revenue: -1 } },
            { $limit: 10 },
          ],
          recentBookings: [
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            {
              $project: {
                userId: 1,
                serviceName: 1,
                servicePrice: 1,
                date: 1,
                time: 1,
                status: 1,
                createdAt: 1,
              },
            },
          ],
          bookingsByDate: [
            {
              $group: {
                _id: "$date",
                count: { $sum: 1 },
                revenue: { $sum: "$servicePrice" },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 30 },
          ],
          upcomingBookings: [
            {
              $match: {
                date: { $gte: new Date().toISOString().split("T")[0] },
                status: { $ne: "cancelled" },
              },
            },
            { $count: "count" },
          ],
        },
      },
    ]);

    sendResponse(res, 200, true, "Booking statistics fetched successfully", stats[0]);
  } catch (error) {
    console.error("❌ Stats Error:", error);
    sendResponse(res, 500, false, "Server error while fetching statistics");
  }
});

// ============================================
// 📊 GET AVAILABLE SLOTS FOR A DATE — Public
// ============================================
router.get("/availability/slots/:date", async (req, res) => {
  try {
    const { date } = req.params;

    if (!isValidDateFormat(date)) {
      return sendResponse(res, 400, false, "Date must be in YYYY-MM-DD format");
    }

    // Check if date is in past
    const bookingDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDate < today) {
      return sendResponse(res, 400, false, "Cannot check availability for past dates");
    }

    // Get availability data
    const availability = await Availability.findOne({ date });

    // Generate time slots (assume 9 AM to 6 PM with 30 min intervals)
    const slots = [];
    for (let hour = 9; hour < 21; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        slots.push({
          time,
          available: true,
        });
      }
    }

    // Mark unavailable slots
    if (availability) {
      if (availability.isFullDayUnavailable) {
        slots.forEach((slot) => {
          slot.available = false;
        });
      } else {
        const unavailableTimes = availability.unavailableSlots.map((s) => s.time);
        slots.forEach((slot) => {
          if (unavailableTimes.includes(slot.time)) {
            slot.available = false;
          }
        });
      }
    }

    sendResponse(res, 200, true, "Available slots fetched successfully", {
      date,
      slots: slots.filter((s) => s.available),
      allSlots: slots,
    });
  } catch (error) {
    console.error("❌ Slots Error:", error);
    sendResponse(res, 500, false, "Server error while fetching availability slots");
  }
});

export default router;
