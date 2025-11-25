import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const productSchema = new mongoose.Schema(
  {
   
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: { type: String, default: "" },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    image: { type: String, default: "" },
    category: { type: String, default: "" },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount: { type: Number, default: 0, min: 0, max: 100 }, // percentage
    featured: { type: Boolean, default: false },
  },
  { timestamps: true }
);



export default mongoose.model("Product", productSchema);
