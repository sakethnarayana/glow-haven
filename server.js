// server.js
import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

// ---- Load environment variables ----
dotenv.config();

// ---- Create express app ----
const app = express();

// ---- Security & common middleware ----
app.use(helmet()); // Adds common HTTP security headers



app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:5173"], // ✅ Explicitly allow your frontend(s)
    credentials: true, // ✅ Allow cookies / Authorization header
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"], // ✅ Explicitly allow headers your frontend sends
  })
);

app.use(express.json({ limit: "10mb" })); // Handle large JSON safely
app.use(express.urlencoded({ extended: true }));

// Logging (only in dev mode)
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// ---- Import routes ----
import userRoutes from "./routes/userRoutes.js";
import addressRoutes from "./routes/addressRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import availabilityRoutes from "./routes/availabilityRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import serviceReviewRoutes from "./routes/serviceReview.js"
import productReviewsRouter from './routes/productReviews.js';
import userpasswordroutes from "./routes/userpasswordroutes.js";

// ---- Register routes ----
app.use("/api/users", userRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/auth", authRoutes);
app.use('/api/services', serviceReviewRoutes);
app.use('/api/products', productReviewsRouter);
app.use('/api/new',userpasswordroutes);

// ---- Health check / root endpoint ----
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🎉 Beauty Salon API is running successfully",
    environment: process.env.NODE_ENV || "development",
  });
});

// ---- 404 Fallback ----
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// ---- Global error handler ----
app.use((err, req, res, next) => {
  console.error("🔥 Global Error Handler:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// ---- MongoDB Connection ----
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 8000;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI not found in environment variables");
  process.exit(1);
}

mongoose.set("strictQuery", true); // Prevent deprecated warnings

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    autoIndex: process.env.NODE_ENV !== "production", // Improve performance in production
  })
  .then(() => {
    console.log("✅ MongoDB connected successfully");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1); // Exit process to allow container restarts
  });
