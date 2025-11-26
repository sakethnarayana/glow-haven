import express from 'express';
import Review from '../models/Review.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router({ mergeParams: true });

// GET /api/services/:id/reviews
router.get('/:id/reviews', async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const skip = (page - 1) * limit;

  try {
    const reviews = await Review.find({ serviceId: id })
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ reviews: reviews.map(r => ({
      _id: r._id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      user: r.userId ? { _id: r.userId._id, name: r.userId.name } : null
    })) });
  } catch (err) {
    console.error('Reviews fetch error', err);
    res.status(500).json({ message: 'Server error fetching reviews' });
  }
});

// POST /api/services/:id/reviews (auth required)
router.post('/:id/reviews', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user?._id;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Invalid rating' });
  }

  try {
    const review = new Review({
      serviceId: id,
      userId,
      rating,
      comment: comment || ''
    });
    await review.save();
    res.status(201).json({ message: 'Review posted', review });
  } catch (err) {
    console.error('Post review error', err);
    res.status(500).json({ message: 'Server error posting review' });
  }
});

export default router;
