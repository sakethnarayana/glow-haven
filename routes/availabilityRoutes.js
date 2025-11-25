import express from "express";
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
 * Validate availability input
 */
const validateAvailabilityInput = (body) => {
  const errors = [];

  if (!body.date || body.date.trim().length === 0) {
    errors.push("Date is required");
  } else if (!isValidDateFormat(body.date)) {
    errors.push("Date must be in YYYY-MM-DD format");
  }

  // Check if trying to set unavailable slots
  if (body.unavailableSlots !== undefined) {
    if (!Array.isArray(body.unavailableSlots)) {
      errors.push("Unavailable slots must be an array");
    } else {
      body.unavailableSlots.forEach((slot, index) => {
        if (!slot.time || typeof slot.time !== "string") {
          errors.push(`Slot ${index} must have a valid time string`);
        } else if (!isValidTimeFormat(slot.time)) {
          errors.push(`Slot ${index} time must be in HH:mm format`);
        }
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// ============================================
// ➕ MARK FULL DAY UNAVAILABLE — Admin only
// ============================================
router.post("/mark-full-day-unavailable", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { date, reason } = req.body;

    if (!date || date.trim().length === 0) {
      return sendResponse(res, 400, false, "Date is required");
    }

    if (!isValidDateFormat(date)) {
      return sendResponse(res, 400, false, "Date must be in YYYY-MM-DD format");
    }

    // Check if date is in past
    const checkDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (checkDate < today) {
      return sendResponse(res, 400, false, "Cannot mark past dates as unavailable");
    }

    // Mark full day unavailable using static method
    const availability = await Availability.markFullDayUnavailable(date);

    sendResponse(res, 200, true, "Full day marked as unavailable", availability);
  } catch (error) {
    console.error("❌ Mark Full Day Unavailable Error:", error);
    sendResponse(res, 500, false, "Server error while marking date unavailable");
  }
});

// ============================================
// ➕ MARK SPECIFIC TIME SLOT UNAVAILABLE — Admin only
// ============================================
router.post("/mark-slot-unavailable", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { date, time } = req.body;

    if (!date || date.trim().length === 0) {
      return sendResponse(res, 400, false, "Date is required");
    }

    if (!isValidDateFormat(date)) {
      return sendResponse(res, 400, false, "Date must be in YYYY-MM-DD format");
    }

    if (!time || time.trim().length === 0) {
      return sendResponse(res, 400, false, "Time is required");
    }

    if (!isValidTimeFormat(time)) {
      return sendResponse(res, 400, false, "Time must be in HH:mm format");
    }

    // Check if date is in past
    const checkDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (checkDate < today) {
      return sendResponse(res, 400, false, "Cannot mark past dates as unavailable");
    }

    // Mark slot unavailable using static method
    const availability = await Availability.markSlotUnavailable(date, time);

    sendResponse(res, 200, true, `Time slot ${time} marked as unavailable on ${date}`, availability);
  } catch (error) {
    console.error("❌ Mark Slot Unavailable Error:", error);
    sendResponse(res, 500, false, "Server error while marking slot unavailable");
  }
});

// ============================================
// ➕ MARK AVAILABLE AGAIN — Admin only
// ============================================
router.post("/mark-available", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { date, time } = req.body;

    if (!date || date.trim().length === 0) {
      return sendResponse(res, 400, false, "Date is required");
    }

    if (!isValidDateFormat(date)) {
      return sendResponse(res, 400, false, "Date must be in YYYY-MM-DD format");
    }

    if (time && !isValidTimeFormat(time)) {
      return sendResponse(res, 400, false, "Time must be in HH:mm format");
    }

    // Mark available using static method
    const availability = await Availability.markAvailableAgain(date, time || null);

    const message = time 
      ? `Time slot ${time} marked as available on ${date}`
      : `All day ${date} marked as available`;

    sendResponse(res, 200, true, message, availability);
  } catch (error) {
    console.error("❌ Mark Available Error:", error);
    sendResponse(res, 500, false, "Server error while marking date available");
  }
});

// ============================================
// 📄 GET ALL AVAILABILITY — 
// ============================================
router.get("/", verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};

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

    // Filter by full day unavailable status
    if (req.query.isFullDayUnavailable === "true") {
      filter.isFullDayUnavailable = true;
    } else if (req.query.isFullDayUnavailable === "false") {
      filter.isFullDayUnavailable = false;
    }

    // Execute query with pagination
    const [availabilities, total] = await Promise.all([
      Availability.find(filter)
        .sort({ date: 1 })
        .limit(limit)
        .skip(skip),
      Availability.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, "Availability records fetched successfully", {
      availabilities,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get All Availability Error:", error);
    sendResponse(res, 500, false, "Server error while fetching availability");
  }
});

// ============================================
// 🔍 GET AVAILABILITY BY DATE — Public
// ============================================
router.get("/check/:date", async (req, res) => {
  try {
    const { date } = req.params;

    if (!isValidDateFormat(date)) {
      return sendResponse(res, 400, false, "Date must be in YYYY-MM-DD format");
    }

    const availability = await Availability.findOne({ date });

    if (!availability) {
      // Date has no restrictions
      return sendResponse(res, 200, true, "Date is fully available", {
        date,
        isFullDayUnavailable: false,
        unavailableSlots: [],
      });
    }

    sendResponse(res, 200, true, "Availability fetched successfully", availability);
  } catch (error) {
    console.error("❌ Get Availability Error:", error);
    sendResponse(res, 500, false, "Server error while fetching availability");
  }
});

// ============================================
// 🔍 GET AVAILABILITY BY ID — Admin only
// ============================================
router.get("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid availability ID format");
    }

    const availability = await Availability.findById(id);

    if (!availability) {
      return sendResponse(res, 404, false, "Availability record not found");
    }

    sendResponse(res, 200, true, "Availability fetched successfully", availability);
  } catch (error) {
    console.error("❌ Get Availability By ID Error:", error);
    sendResponse(res, 500, false, "Server error while fetching availability");
  }
});

// ============================================
// ✏️ UPDATE AVAILABILITY — Admin only
// ============================================
router.put("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid availability ID format");
    }

    // Validate input
    const validation = validateAvailabilityInput(req.body);
    if (!validation.isValid) {
      return sendResponse(res, 400, false, validation.errors.join(", "));
    }

    const availability = await Availability.findById(id);
    if (!availability) {
      return sendResponse(res, 404, false, "Availability record not found");
    }

    // Build update object
    const updateFields = {};
    if (req.body.date) updateFields.date = req.body.date.trim();
    if (req.body.isFullDayUnavailable !== undefined) updateFields.isFullDayUnavailable = req.body.isFullDayUnavailable;
    if (req.body.unavailableSlots !== undefined) updateFields.unavailableSlots = req.body.unavailableSlots;

    const updatedAvailability = await Availability.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    });

    sendResponse(res, 200, true, "Availability updated successfully", updatedAvailability);
  } catch (error) {
    console.error("❌ Update Availability Error:", error);
    sendResponse(res, 500, false, "Server error while updating availability");
  }
});

// ============================================
// 🗑️ DELETE AVAILABILITY — Admin only
// ============================================
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid availability ID format");
    }

    const availability = await Availability.findById(id);
    if (!availability) {
      return sendResponse(res, 404, false, "Availability record not found");
    }

    await Availability.findByIdAndDelete(id);

    sendResponse(res, 200, true, "Availability deleted successfully");
  } catch (error) {
    console.error("❌ Delete Availability Error:", error);
    sendResponse(res, 500, false, "Server error while deleting availability");
  }
});

// ============================================
// 📊 GET AVAILABILITY STATISTICS — Admin only
// ============================================
router.get("/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const stats = await Availability.aggregate([
      {
        $facet: {
          totalRecords: [{ $count: "count" }],
          fullDayUnavailableCount: [
            { $match: { isFullDayUnavailable: true } },
            { $count: "count" },
          ],
          partialDayCount: [
            { $match: { isFullDayUnavailable: false, unavailableSlots: { $exists: true, $ne: [] } } },
            { $count: "count" },
          ],
          totalUnavailableSlots: [
            { $unwind: "$unavailableSlots" },
            { $count: "count" },
          ],
          dateRange: [
            {
              $group: {
                _id: null,
                earliestDate: { $min: "$date" },
                latestDate: { $max: "$date" },
              },
            },
          ],
          unavailableByTime: [
            { $unwind: "$unavailableSlots" },
            {
              $group: {
                _id: "$unavailableSlots.time",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ],
          recentRecords: [
            { $sort: { date: -1 } },
            { $limit: 10 },
            {
              $project: {
                date: 1,
                isFullDayUnavailable: 1,
                slotCount: { $size: { $ifNull: ["$unavailableSlots", []] } },
              },
            },
          ],
        },
      },
    ]);

    sendResponse(res, 200, true, "Availability statistics fetched successfully", stats[0]);
  } catch (error) {
    console.error("❌ Stats Error:", error);
    sendResponse(res, 500, false, "Server error while fetching statistics");
  }
});

// ============================================
// 📊 GET CALENDAR VIEW — Admin only
// ============================================
router.get("/admin/calendar", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return sendResponse(res, 400, false, "Month and year query parameters are required");
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (monthNum < 1 || monthNum > 12 || yearNum < 2000 || yearNum > 2100) {
      return sendResponse(res, 400, false, "Invalid month or year");
    }

    const startDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-01`;
    const endDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-${new Date(yearNum, monthNum, 0).getDate()}`;

    const availabilities = await Availability.find({
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 });

    const calendar = [];
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const availability = availabilities.find((a) => a.date === dateStr);

      calendar.push({
        date: dateStr,
        isFullDayUnavailable: availability ? availability.isFullDayUnavailable : false,
        slotCount: availability ? availability.unavailableSlots.length : 0,
        unavailableSlots: availability ? availability.unavailableSlots : [],
      });
    }

    sendResponse(res, 200, true, "Calendar view generated successfully", {
      month: monthNum,
      year: yearNum,
      calendar,
    });
  } catch (error) {
    console.error("❌ Calendar Error:", error);
    sendResponse(res, 500, false, "Server error while generating calendar");
  }
});

// ============================================
// 🔄 BULK MARK UNAVAILABLE — Admin only
// ============================================
router.post("/admin/bulk-unavailable", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { dates, isFullDay } = req.body;

    if (!Array.isArray(dates) || dates.length === 0) {
      return sendResponse(res, 400, false, "Dates array is required and must not be empty");
    }

    const results = [];
    const errors = [];

    for (const date of dates) {
      try {
        if (!isValidDateFormat(date)) {
          errors.push(`Invalid date format: ${date}`);
          continue;
        }

        if (isFullDay) {
          const availability = await Availability.markFullDayUnavailable(date);
          results.push({
            date,
            success: true,
            message: "Full day marked unavailable",
          });
        } else {
          errors.push(`isFullDay parameter required for bulk operation on ${date}`);
        }
      } catch (err) {
        errors.push(`Error processing ${date}: ${err.message}`);
      }
    }

    sendResponse(res, 200, true, "Bulk operation completed", {
      successful: results,
      failed: errors,
      summary: {
        total: dates.length,
        successful: results.length,
        failed: errors.length,
      },
    });
  } catch (error) {
    console.error("❌ Bulk Unavailable Error:", error);
    sendResponse(res, 500, false, "Server error during bulk operation");
  }
});

export default router;