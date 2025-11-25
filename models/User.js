import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const userSchema = new mongoose.Schema(
  {
    
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      validate: {
        validator: function (v) {
          // Allow only digits, +, and length between 10–15
          return /^\+?\d{10,15}$/.test(v);
        },
        message: (props) => `${props.value} is not a valid phone number`,
      },
    },
    name: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 100,
      default: "",
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      required: true,
    },
  },
  { timestamps: true }
);



// Prevent "Cannot overwrite model" error during hot reload
export default mongoose.models.User || mongoose.model("User", userSchema);
