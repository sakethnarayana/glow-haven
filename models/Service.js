import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const serviceSchema = new mongoose.Schema(
  {
    
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    duration: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ["facial", "haircare", "massage", "makeup", "threading"],
      default: "facial",
      trim: true,
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);


export default mongoose.model("Service", serviceSchema);
