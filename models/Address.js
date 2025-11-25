import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const addressSchema = new mongoose.Schema(
  {
    
    userId: {
      type: mongoose.Schema.Types.ObjectId, // 👈 Reference actual MongoDB _id
      ref: "User",
      required: true,
      index: true,
    },

    label: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "",
    },
    recipientName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^\+?\d{10,15}$/.test(v);
        },
        message: (props) => `${props.value} is not a valid phone number`,
      },
    },
    addressLine: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    landmark: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    pincode: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{5,10}$/, "Invalid pincode format"],
    },
    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

//
// ✅ Pre-save hooks for consistency
//

// Auto-generate addressId if missing
addressSchema.pre("save", async function (next) {
  if (this.isDefault) {
    await mongoose.models.Address.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

//
// ✅ Safety: prevent overwriting model (important for hot reloads / serverless)
//
export default mongoose.models.Address || mongoose.model("Address", addressSchema);
