/**
 * Popular Products API - Trending/Top-Selling Products
 *
 * This router fetches most popular or trending products from the warehouse
 * associated with the customer's pincode. Products are ranked by sales data.
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import popularProductsRouter from './routes/popularProducts.router.js';
 *    app.use('/api/v1/products', popularProductsRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import { popularProductsQueryValidation } from '../validations/popularProductsValidation.js'
import { getPopularProducts } from '../controllers/popularProductsController.js'

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
 * GET /api/v1/products/popular
 * Get most popular/trending products based on sales data
 */
router.get('/popular', popularProductsQueryValidation, validate, getPopularProducts)

export default router

