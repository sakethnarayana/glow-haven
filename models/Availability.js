import mongoose from "mongoose";

const availabilitySchema = new mongoose.Schema(
  {
    // ---- Date (Unique per document) ----
    date: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"],
      index: true,
    },

    // ---- Whether the whole day is unavailable ----
    isFullDayUnavailable: {
      type: Boolean,
      default: false,
    },

    // ---- Specific unavailable slots ----
    unavailableSlots: [
      {
        time: {
          type: String,
          required: true,
          match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"],
        },
      },
    ],
  },
  { timestamps: true }
);

//
// ✅ Hooks
//
availabilitySchema.pre("save", function (next) {
  // If full day is unavailable, clear slots
  if (this.isFullDayUnavailable) {
    this.unavailableSlots = [];
  }

  // Deduplicate slots
  if (this.unavailableSlots && this.unavailableSlots.length > 0) {
    const uniqueSlots = Array.from(new Set(this.unavailableSlots.map(s => s.time))).map(t => ({ time: t }));
    this.unavailableSlots = uniqueSlots;
  }

  next();
});

//
// ✅ Static Methods
//

// 1️⃣ Mark full day unavailable
availabilitySchema.statics.markFullDayUnavailable = async function (date) {
  return this.findOneAndUpdate(
    { date },
    { isFullDayUnavailable: true, unavailableSlots: [] },
    { upsert: true, new: true }
  );
};

// 2️⃣ Mark a specific time slot unavailable
availabilitySchema.statics.markSlotUnavailable = async function (date, time) {
  const existing = await this.findOne({ date });

  // If full day unavailable, skip
  if (existing && existing.isFullDayUnavailable) return existing;

  // Add slot if not already present
  if (existing) {
    const already = existing.unavailableSlots.some(s => s.time === time);
    if (!already) {
      existing.unavailableSlots.push({ time });
      await existing.save();
    }
    return existing;
  }

  // Create new entry
  return this.create({ date, unavailableSlots: [{ time }] });
};

// 3️⃣ Make full day or slot available again
availabilitySchema.statics.markAvailableAgain = async function (date, time = null) {
  const existing = await this.findOne({ date });
  if (!existing) return null;

  if (time === null) {
    // Remove entire date entry (day becomes available)
    await this.deleteOne({ date });
    return null;
  }

  // Remove one time slot
  existing.unavailableSlots = existing.unavailableSlots.filter(s => s.time !== time);
  existing.isFullDayUnavailable = false;

  if (existing.unavailableSlots.length === 0) {
    await existing.deleteOne();
    return null;
  }

  return existing.save();
};

//
// ✅ Export Model (with Hot Reload Support)
//
export default mongoose.models.Availability || mongoose.model("Availability", availabilitySchema);
