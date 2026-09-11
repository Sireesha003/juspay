/**
 * Categories API - Warehouse-Based Category Fetching
 *
 * This router fetches active categories for a warehouse determined by pincode.
 * Each category includes the count of active products available in that warehouse.
 *
 * INTEGRATION:
 * 1. Mount this router in your main app:
 *    import categoriesRouter from './routes/categories.router.js';
 *    app.use('/api/v1/categories', categoriesRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import {
  categoriesBodyValidation,
  categoriesQueryValidation
} from '../validations/categoriesValidation.js'
import { fetchCategories } from '../controllers/categoriesController.js'

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
 * POST /api/v1/categories
 * Fetch categories for warehouse determined by pincode
 */
router.post('/', categoriesBodyValidation, validate, fetchCategories)

/**
 * GET /api/v1/categories?pincode=560001
 * Alternative endpoint using query parameters (for convenience)
 */
router.get('/', categoriesQueryValidation, validate, fetchCategories)

export default router
