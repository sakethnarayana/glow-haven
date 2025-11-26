import express from "express";
import Service from "../models/Service.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

/**
 * ➕ Create new service — Admin only
 */
router.post("/", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { name, description, price, duration, image, category ,discount, featured, videoUrl} = req.body;

    if (!name || !price || !duration || !category) {
      return res.status(400).json({ message: "Name, price, duration and category are required." });
    }

    const d = discount !== undefined && discount !== null ? Number(discount) : 0;
    if (Number.isNaN(d) || d < 0 || d > 100) {
      return res.status(400).json({ message: "Discount must be a number between 0 and 100." });
    }

    const newService = new Service({
      name: name.trim(),
      description: description?.trim() || "",
      price,
      duration: duration.trim(),
      category: category.trim(),
      image: image || "",
      discount: d,
      featured: !!featured,
      videoUrl: videoUrl?.trim() || "",
    });

    const service = await newService.save();

    res.status(201).json({
      message: "Service created successfully.",
      service,
    });
  } catch (error) {
    console.error("Create Service Error:", error);
    res.status(500).json({ message: "Server error while creating service.", error: error.message });
  }
});


/**
 * 📄 Get all services (Public)
 */
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.featured === "true") filter.featured = true;
    else if (req.query.featured === "false") filter.featured = false;

    const services = await Service.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      total: services.length,
      services,
    });
  } catch (error) {
    console.error("Get All Services Error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching services.", error: error.message });
  }
});

/**
 * 🔍 Get a single service by ID (Public)
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid service ID format." });
    }

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }

    res.status(200).json(service);
  } catch (error) {
    console.error("Get Service Error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching service.", error: error.message });
  }
});

/**
 * ✏️ Update a service — Admin only
 */
router.put("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid service ID format." });
    }

    const updateFields = (({ name, description, price, duration, image, category,discount,featured,videoUrl ,}) => ({
      ...(name && { name }),
      ...(description && { description }),
      ...(price && { price }),
      ...(duration && { duration }),
      ...(image && { image }),
      ...(category && { category }),
      ...(discount !== undefined && { discount: Number(discount) }),
      ...(featured !== undefined && { featured: Boolean(featured) }),
      ...(videoUrl !== undefined && { videoUrl }),
    }))(req.body);

    const updatedService = await Service.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    });

    if (!updatedService) {
      return res.status(404).json({ message: "Service not found." });
    }

    res.status(200).json({
      message: "Service updated successfully.",
      service: updatedService,
    });
  } catch (error) {
    console.error("Update Service Error:", error);
    res
      .status(500)
      .json({ message: "Server error while updating service.", error: error.message });
  }
});

/**
 * 🗑️ Delete a service — Admin only
 */
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid service ID format." });
    }

    const deletedService = await Service.findByIdAndDelete(id);

    if (!deletedService) {
      return res.status(404).json({ message: "Service not found." });
    }

    res.status(200).json({
      message: "Service deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Service Error:", error);
    res
      .status(500)
      .json({ message: "Server error while deleting service.", error: error.message });
  }
});

export default router;
