/**
 * Ratings API - Product Ratings and Reviews
 *
 * This router handles all rating-related operations including:
 * - Adding/updating product ratings
 * - Getting product ratings
 * - Getting user's ratings
 * - Updating/deleting ratings
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import ratingsRouter from './routes/ratings.router.js';
 *    app.use('/api/v1', ratingsRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import {
  addRatingValidation,
  getProductRatingsValidation,
  getUserRatingsValidation,
  updateRatingValidation,
  ratingIdValidation
} from '../validations/ratingsValidation.js'
import {
  addOrUpdateRating,
  getProductRatings,
  getUserRatings,
  updateRating,
  deleteRating
} from '../controllers/ratingsController.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const router = express.Router()

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors)
  }
  next()
}

/**
 * POST /api/v1/products/:productId/ratings
 * Add or update product rating and review
 */
router.post('/products/:productId/ratings', authMiddleware, addRatingValidation, validate, addOrUpdateRating)

/**
 * GET /api/v1/products/:productId/ratings
 * Get all ratings and reviews for a product
 */
router.get('/products/:productId/ratings', getProductRatingsValidation, validate, getProductRatings)

/**
 * GET /api/v1/ratings/my-ratings
 * Get user's own ratings
 */
router.get('/ratings/my-ratings', authMiddleware, getUserRatingsValidation, validate, getUserRatings)

/**
 * PATCH /api/v1/ratings/:ratingId
 * Update existing rating/review
 */
router.patch('/ratings/:ratingId', authMiddleware, updateRatingValidation, validate, updateRating)

/**
 * DELETE /api/v1/ratings/:ratingId
 * Delete rating/review
 */
router.delete('/ratings/:ratingId', authMiddleware, ratingIdValidation, validate, deleteRating)

export default router

