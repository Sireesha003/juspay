/**
 * Sub-Categories API - Warehouse-Based Sub-Category Fetching
 *
 * This router fetches active sub-categories for a warehouse determined by pincode.
 * Each sub-category includes the count of active products available in that warehouse.
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import subcategoriesRouter from './routes/subcategories.router.js';
 *    app.use('/api/v1/subcategories', subcategoriesRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import { subcategoriesBodyValidation, subcategoriesQueryValidation } from '../validations/subcategoriesValidation.js'
import { fetchSubCategories } from '../controllers/subcategoriesController.js'

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
 * POST /api/v1/subcategories
 * Fetch sub-categories for warehouse determined by pincode
 */
router.post('/', subcategoriesBodyValidation, validate, fetchSubCategories)

/**
 * GET /api/v1/subcategories?pincode=560001
 * Alternative endpoint using query parameters (for convenience)
 */
router.get('/', subcategoriesQueryValidation, validate, fetchSubCategories)

export default router
