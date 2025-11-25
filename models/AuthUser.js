import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const authUserSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, "Invalid 10-digit Indian phone number"],
    },
    name: {
      type: String,
      required: true,
      minlength: 2,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
  },
  { timestamps: true }
);

// 🔐 Hash password before save
authUserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

export default mongoose.models.AuthUser ||
  mongoose.model("AuthUser", authUserSchema);
