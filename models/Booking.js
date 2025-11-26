import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    // ---- Relations ----
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },

    // ---- Service snapshot (for historical record keeping) ----
    serviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    servicePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    serviceDuration: {
      type: String,
      trim: true,
      default: "",
    },

    // ---- Booking details ----
    date: {
      type: String,
      required: true, // "YYYY-MM-DD"
      match: [/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"],
    },
    time: {
      type: String,
      required: true, // "HH:mm"
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"],
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v) => /^\+?\d{10,15}$/.test(v),
        message: (props) => `${props.value} is not a valid phone number`,
      },
    },

    // ---- Status tracking ----
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled","in_progress"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

//
// ✅ Hooks
//

// Prevent duplicate booking for same user, date, and time
bookingSchema.pre("save", async function (next) {
  if (!this.isModified("date") && !this.isModified("time")) return next();

  const existing = await mongoose.models.Booking.findOne({
    userId: this.userId,
    date: this.date,
    time: this.time,
    status: { $ne: "cancelled" },
  });

  if (existing) {
    const err = new Error("User already has a booking at this date and time");
    err.statusCode = 400;
    return next(err);
  }

  next();
});

//
// ✅ Export safely
//
export default mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
