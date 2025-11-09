import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Service from "../models/Service.js";

// Load .env from project root no matter where script runs
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI not found in .env");
  process.exit(1);
}

async function run() {
  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected!");

    console.log("🔍 Checking for services without category...");
    const missingCount = await Service.countDocuments({ category: { $exists: false } });

    if (missingCount === 0) {
      console.log("✅ All services already have category. Nothing to update.");
    } else {
      console.log(`⚠️ Found ${missingCount} service(s) missing category. Updating...`);
      const result = await Service.updateMany(
        { category: { $exists: false } },
        { $set: { category: "facial" } }
      );
      console.log(`✅ Updated ${result.modifiedCount} services.`);
    }

  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

run();
