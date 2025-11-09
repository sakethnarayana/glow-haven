import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    // --- User reference ---
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // --- Address reference ---
    addressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },

    // --- Ordered items ---
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: {
          type: String,
          required: true,
          trim: true,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        subtotal: {
          type: Number,
          min: 0,
        },
      },
    ],

    // --- Order total ---
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // --- Order status ---
    status: {
      type: String,
      enum: ["pending", "confirmed", "delivered", "cancelled","in_transit"],
      default: "pending",
      index: true,
    },

    // --- Payment info ---
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "refunded"],
      default: "unpaid",
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "online"],
      default: "cod",
    },
  },
  { timestamps: true }
);

//
// ✅ Pre-save hook to compute totals automatically
//
orderSchema.pre("save", function (next) {
  if (this.items && this.items.length > 0) {
    this.items.forEach((item) => {
      item.subtotal = item.price * item.quantity;
    });
    this.totalAmount = this.items.reduce((sum, item) => sum + item.subtotal, 0);
  }
  next();
});

//
// ✅ Index optimization for frequent queries
//
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

//
// ✅ Export safely (for hot reload or serverless environments)
//
export default mongoose.models.Order || mongoose.model("Order", orderSchema);
