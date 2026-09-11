/**
 * Brands API - Top Brands Available in Warehouse
 *
 * This router fetches active brands available in the warehouse determined by pincode.
 * Each brand includes product count and representative image.
 *
 * INTEGRATION:
 * 1. Mount this router in your main app:
 *    import brandsRouter from './routes/brands.router.js';
 *    app.use('/api/v1/brands', brandsRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import {
  brandsBodyValidation,
  brandsQueryValidation
} from '../validations/brandsValidation.js'
import { getTopBrands } from '../controllers/brandsController.js'

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
 * POST /api/v1/brands
 * Fetch top brands for warehouse determined by pincode
 */
router.post('/', brandsBodyValidation, validate, getTopBrands)

/**
 * GET /api/v1/brands?pincode=560001
 * Alternative endpoint using query parameters (for convenience)
 */
router.get('/', brandsQueryValidation, validate, getTopBrands)

export default router

