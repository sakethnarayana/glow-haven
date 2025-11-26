// routes/productReviews.js
import express from 'express';
import Product from '../models/Product.js';
import ProductReview from '../models/ProductReview.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/products/:id/reviews?page=1&limit=20
 * returns: { total, reviews: [ {..populated user..} ] }
 */
router.get('/:id/reviews', async (req, res) => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '20'));
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ message: 'Invalid product id' });

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      ProductReview.find({ product: id }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'name email'),
      ProductReview.countDocuments({ product: id })
    ]);

    return res.status(200).json({ total, reviews });
  } catch (err) {
    console.error('Get product reviews error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/products/:id/reviews
 * body: { rating, comment }
 * Auth required (verifyToken). prevents duplicate reviews by same user
 */
router.post('/:id/reviews', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user?._id; // verifyToken should populate req.user

    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ message: 'Invalid product id' });
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating between 1 and 5 required' });

    // Upsert style: prevent duplicates
    const existing = await ProductReview.findOne({ product: id, user: userId });
    if (existing) {
      existing.rating = rating;
      existing.comment = comment || existing.comment;
      await existing.save();
      return res.status(200).json({ message: 'Review updated', review: existing });
    }

    const newReview = new ProductReview({
      product: id,
      user: userId,
      rating,
      comment: comment || ''
    });

    await newReview.save();
    // Optionally: update product aggregate (not required, can be computed on the fly)
    return res.status(201).json({ message: 'Review posted', review: newReview });
  } catch (err) {
    if (err.code === 11000) { // unique index violation
      return res.status(409).json({ message: 'You have already reviewed this product' });
    }
    console.error('Post product review error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
