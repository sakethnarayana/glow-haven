import express from "express";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";
import mongoose from "mongoose";

const router = express.Router();

// ============================================
// 🛠️ UTILITY FUNCTIONS
// ============================================

/**
 * Validate MongoDB ObjectId
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id) && 
         String(new mongoose.Types.ObjectId(id)) === id;
};

/**
 * Standard response formatter
 */
const sendResponse = (res, statusCode, success, message, data = null) => {
  const response = { success, message };
  if (data) response.data = data;
  res.status(statusCode).json(response);
};

/**
 * Validate product input
 */
const validateProductInput = (body) => {
  const errors = [];

  if (!body.name || body.name.trim().length === 0) {
    errors.push("Product name is required");
  } else if (body.name.trim().length < 2) {
    errors.push("Product name must be at least 2 characters");
  } else if (body.name.trim().length > 100) {
    errors.push("Product name must not exceed 100 characters");
  }

  if (body.price === undefined || body.price === null) {
    errors.push("Price is required");
  } else if (typeof body.price !== "number" || body.price < 0) {
    errors.push("Price must be a non-negative number");
  }

  if (body.stock !== undefined && body.stock !== null) {
    if (typeof body.stock !== "number" || body.stock < 0) {
      errors.push("Stock must be a non-negative number");
    }
  }

  if (body.description && body.description.trim().length > 1000) {
    errors.push("Description must not exceed 1000 characters");
  }

  if (body.image && body.image.trim().length > 500) {
    errors.push("Image URL must not exceed 500 characters");
  }

  if (body.category && body.category.trim().length > 100) {
    errors.push("Category must not exceed 100 characters");
  }

  if (body.discount !== undefined && body.discount !== null) {
    const d = Number(body.discount);
    if (Number.isNaN(d) || d < 0 || d > 100) {
      errors.push("Discount must be a number between 0 and 100");
    }
  }

  // featured must be boolean if provided
  if (body.featured !== undefined && typeof body.featured !== "boolean") {
    // allow strings 'true'/'false' if you prefer — but keep strict here
    errors.push("Featured must be a boolean");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// ============================================
// ➕ CREATE NEW PRODUCT — Admin only
// ============================================
router.post("/", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { name, description, price, image, category, stock ,discount, featured} = req.body;

    // Validate input
    const validation = validateProductInput(req.body);
    if (!validation.isValid) {
      return sendResponse(res, 400, false, validation.errors.join(", "));
    }

    // Check if product name already exists (optional - prevent duplicates)
    const existingProduct = await Product.findOne({
      name: new RegExp(`^${name.trim()}$`, "i"), // Case-insensitive
    });

    if (existingProduct) {
      return sendResponse(res, 409, false, "Product with this name already exists");
    }

    // Create new product
    const newProduct = new Product({
      name: name.trim(),
      description: description?.trim() || "",
      price,
      discount: discount !== undefined ? Number(discount) : 0,
      featured: featured === true,
      image: image?.trim() || "",
      category: category?.trim() || "",
      stock: stock || 0,
    });

    const savedProduct = await newProduct.save();

    sendResponse(res, 201, true, "Product created successfully", savedProduct);
  } catch (error) {
    console.error("❌ Create Product Error:", error);
    sendResponse(res, 500, false, "Server error while creating product");
  }
});

// ============================================
// 📄 GET ALL PRODUCTS — Public (with pagination, filtering & search)
// ============================================
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10); // Max 50 per page
    const skip = (page - 1) * limit;

    // Build filter query
    const filter = {};

    // Search by name or description
    if (req.query.search) {
      filter.$or = [
        { name: new RegExp(req.query.search.trim(), "i") },
        { description: new RegExp(req.query.search.trim(), "i") },
      ];
    }

    // Filter by category
    if (req.query.category) {
      filter.category = new RegExp(`^${req.query.category.trim()}$`, "i");
    }

    // Filter by price range
    if (req.query.minPrice || req.query.maxPrice) {
      filter.price = {};
      if (req.query.minPrice) {
        filter.price.$gte = parseFloat(req.query.minPrice);
      }
      if (req.query.maxPrice) {
        filter.price.$lte = parseFloat(req.query.maxPrice);
      }
    }

    if (req.query.featured === "true") filter.featured = true;
    else if (req.query.featured === "false") filter.featured = false;

    // Filter by stock status
    if (req.query.inStock === "true") {
      filter.stock = { $gt: 0 };
    } else if (req.query.inStock === "false") {
      filter.stock = { $lte: 0 };
    }

    // Execute query with pagination
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip),
      Product.countDocuments(filter),
    ]);

    sendResponse(res, 200, true, "Products fetched successfully", {
      products,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Get All Products Error:", error);
    sendResponse(res, 500, false, "Server error while fetching products");
  }
});

// ============================================
// 🔍 GET SINGLE PRODUCT BY ID — Public
// ============================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid product ID format");
    }

    const product = await Product.findById(id);

    if (!product) {
      return sendResponse(res, 404, false, "Product not found");
    }

    sendResponse(res, 200, true, "Product fetched successfully", product);
  } catch (error) {
    console.error("❌ Get Product Error:", error);
    sendResponse(res, 500, false, "Server error while fetching product");
  }
});

// ============================================
// ✏️ UPDATE PRODUCT — Admin only
// ============================================
router.put("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid product ID format");
    }

    // Check if product exists
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return sendResponse(res, 404, false, "Product not found");
    }

    // Validate input
    const validation = validateProductInput(req.body);
    if (!validation.isValid) {
      return sendResponse(res, 400, false, validation.errors.join(", "));
    }

    // Check for duplicate name (if name is being updated)
    if (req.body.name && req.body.name.trim() !== existingProduct.name) {
      const duplicate = await Product.findOne({
        _id: { $ne: id },
        name: new RegExp(`^${req.body.name.trim()}$`, "i"),
      });

      if (duplicate) {
        return sendResponse(res, 409, false, "Another product with this name already exists");
      }
    }

    // Build update object (only include provided fields)
    const updateFields = {};
    if (req.body.name) updateFields.name = req.body.name.trim();
    if (req.body.description !== undefined) updateFields.description = req.body.description.trim();
    if (req.body.price !== undefined) updateFields.price = req.body.price;
    if (req.body.image !== undefined) updateFields.image = req.body.image?.trim() || "";
    if (req.body.category !== undefined) updateFields.category = req.body.category?.trim() || "";
    if (req.body.stock !== undefined) updateFields.stock = req.body.stock;
    if (req.body.discount !== undefined) updateFields.discount = Number(req.body.discount);
    if (req.body.featured !== undefined) updateFields.featured = Boolean(req.body.featured);

    const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    });

    sendResponse(res, 200, true, "Product updated successfully", updatedProduct);
  } catch (error) {
    console.error("❌ Update Product Error:", error);
    sendResponse(res, 500, false, "Server error while updating product");
  }
});

// ============================================
// 🗑️ DELETE PRODUCT — Admin only (with order check)
// ============================================
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid product ID format");
    }

    const product = await Product.findById(id);
    if (!product) {
      return sendResponse(res, 404, false, "Product not found");
    }

    // Check if product has active orders
    const activeOrders = await Order.countDocuments({
      "items.productId": id,
      status: { $in: ["pending", "confirmed"] },
    });

    if (activeOrders > 0) {
      return sendResponse(
        res,
        400,
        false,
        `Cannot delete product. ${activeOrders} active order(s) contain this product.`
      );
    }

    // Option 1: Hard delete (remove completely)
    await Product.findByIdAndDelete(id);

    // Option 2: Soft delete (if you add isActive field to schema)
    // await Product.findByIdAndUpdate(id, { isActive: false });

    sendResponse(res, 200, true, "Product deleted successfully");
  } catch (error) {
    console.error("❌ Delete Product Error:", error);
    sendResponse(res, 500, false, "Server error while deleting product");
  }
});

// ============================================
// 📊 GET PRODUCT STATISTICS — Admin only
// ============================================
router.get("/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const stats = await Product.aggregate([
      {
        $facet: {
          totalProducts: [{ $count: "count" }],
          avgPrice: [{ $group: { _id: null, average: { $avg: "$price" } } }],
          priceRange: [
            {
              $group: {
                _id: null,
                min: { $min: "$price" },
                max: { $max: "$price" },
              },
            },
          ],
          totalStock: [{ $group: { _id: null, total: { $sum: "$stock" } } }],
          outOfStock: [{ $match: { stock: { $lte: 0 } } }, { $count: "count" }],
          lowStock: [{ $match: { stock: { $lt: 10 } } }, { $count: "count" }],
          byCategory: [
            {
              $group: {
                _id: "$category",
                count: { $sum: 1 },
                avgPrice: { $avg: "$price" },
              },
            },
            { $sort: { count: -1 } },
          ],
          featuredCount: [{ $match: { featured: true } }, { $count: "count" }],
          topProducts: [
            { $sort: { stock: -1 } },
            { $limit: 5 },
            { $project: { name: 1, price: 1, stock: 1, category: 1 } },
          ],
        },
      },
    ]);

    sendResponse(res, 200, true, "Statistics fetched successfully", stats[0]);
  } catch (error) {
    console.error("❌ Stats Error:", error);
    sendResponse(res, 500, false, "Server error while fetching statistics");
  }
});

// ============================================
// 🔄 GET PRODUCTS WITH ORDER COUNT — Admin only
// ============================================
router.get("/admin/with-orders", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const products = await Order.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          totalOrders: { $sum: 1 },
          totalQuantitySold: { $sum: "$items.quantity" },
          totalRevenue: { $sum: "$items.subtotal" },
        },
      },
      { $sort: { totalRevenue: -1 } },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      { $unwind: "$productDetails" },
      {
        $project: {
          _id: 1,
          name: "$productDetails.name",
          price: "$productDetails.price",
          category: "$productDetails.category",
          stock: "$productDetails.stock",
          totalOrders: 1,
          totalQuantitySold: 1,
          totalRevenue: 1,
          avgOrderValue: { $divide: ["$totalRevenue", "$totalOrders"] },
        },
      },
    ]);

    sendResponse(res, 200, true, "Products with order stats fetched", products);
  } catch (error) {
    console.error("❌ Products with Orders Error:", error);
    sendResponse(res, 500, false, "Server error fetching products");
  }
});

// ============================================
// 🔄 UPDATE PRODUCT STOCK — Admin only
// ============================================
router.patch("/:id/stock", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!isValidObjectId(id)) {
      return sendResponse(res, 400, false, "Invalid product ID format");
    }

    if (quantity === undefined || typeof quantity !== "number") {
      return sendResponse(res, 400, false, "Valid quantity is required");
    }

    const product = await Product.findById(id);
    if (!product) {
      return sendResponse(res, 404, false, "Product not found");
    }

    const newStock = product.stock + quantity;
    if (newStock < 0) {
      return sendResponse(res, 400, false, `Cannot reduce stock below 0. Current stock: ${product.stock}`);
    }

    product.stock = newStock;
    const updatedProduct = await product.save();

    sendResponse(res, 200, true, `Stock updated successfully. New stock: ${newStock}`, updatedProduct);
  } catch (error) {
    console.error("❌ Update Stock Error:", error);
    sendResponse(res, 500, false, "Server error while updating stock");
  }
});

// ============================================
// 🔄 BULK UPDATE STOCK — Admin only
// ============================================
router.post("/admin/bulk-stock", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { updates } = req.body; // Array of { productId, quantity }

    if (!Array.isArray(updates) || updates.length === 0) {
      return sendResponse(res, 400, false, "Updates array is required and must not be empty");
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        if (!isValidObjectId(update.productId)) {
          errors.push(`Invalid product ID: ${update.productId}`);
          continue;
        }

        const product = await Product.findById(update.productId);
        if (!product) {
          errors.push(`Product not found: ${update.productId}`);
          continue;
        }

        const newStock = product.stock + update.quantity;
        if (newStock < 0) {
          errors.push(`Cannot reduce stock below 0 for product: ${product.name}`);
          continue;
        }

        product.stock = newStock;
        await product.save();
        results.push({
          productId: update.productId,
          name: product.name,
          newStock,
          success: true,
        });
      } catch (err) {
        errors.push(`Error updating ${update.productId}: ${err.message}`);
      }
    }

    sendResponse(res, 200, true, "Bulk stock update completed", {
      successful: results,
      failed: errors,
      summary: {
        total: updates.length,
        successful: results.length,
        failed: errors.length,
      },
    });
  } catch (error) {
    console.error("❌ Bulk Stock Update Error:", error);
    sendResponse(res, 500, false, "Server error during bulk stock update");
  }
});

export default router;