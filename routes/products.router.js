/**
 * Products API - Category and Sub-Category Based Product Listing
 *
 * This router fetches products filtered by category or sub-category for a warehouse
 * determined by pincode. Supports pagination, filtering, and sorting.
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import productsRouter from './routes/products.router.js';
 *    app.use('/api/v1/products', productsRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import { productsQueryValidation } from '../validations/productsValidation.js'
import {
  getProductsByCategory,
  getProductsBySubCategory,
  getProductById,
  getSimilarProductsById,
  searchProducts,
  getProductSuggestions,
  getProductFilters,
  getShopByNeedProducts,
  getDailyDealsProducts,
  getFlashDealsProducts,
  getWeeklySpecialsProducts
} from '../controllers/productsController.js'
import { getPopularProducts } from '../controllers/popularProductsController.js'
import { popularProductsQueryValidation } from '../validations/popularProductsValidation.js'
import { getOffersProducts } from '../controllers/offersProductsController.js'
import { offersProductsQueryValidation } from '../validations/offersProductsValidation.js'
import { optionalAuth } from '../middlewares/optionalAuthMiddleware.js'

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
 * GET /api/v1/products/suggestions
 * Get product name suggestions for search autocomplete
 * NOTE: Must come before /:productId to avoid route conflicts
 */
router.get('/suggestions', optionalAuth,productsQueryValidation, validate, getProductSuggestions)

/**
 * GET /api/v1/products
 * Search all products (without category/subcategory filter)
 */
router.get('/', optionalAuth,productsQueryValidation, validate, searchProducts)

/**
 * GET /api/v1/products/filters
 * Get product filters metadata (price range, brands)
 * NOTE: Must come before /:productId to avoid route conflicts
 */
router.get('/filters', optionalAuth, productsQueryValidation, validate, getProductFilters)

/**
 * GET /api/v1/products/category/:categoryId
 * Get products by category
 * NOTE: Must come before /:productId to avoid route conflicts
 */
router.get('/category/:categoryId',optionalAuth, productsQueryValidation, validate, getProductsByCategory)

/**
 * GET /api/v1/products/subcategory/:subCategoryId
 * Get products by sub-category
 * NOTE: Must come before /:productId to avoid route conflicts
 */
router.get('/subcategory/:subCategoryId',optionalAuth, productsQueryValidation, validate, getProductsBySubCategory)

/**
 * GET /api/v1/products/popular
 * Get most popular/trending products based on sales data
 * NOTE: Must come before /:productId to avoid route conflicts
 */
router.get('/popular',optionalAuth, popularProductsQueryValidation, validate, getPopularProducts)

/**
 * GET /api/v1/products/offers
 * Get products with offers (discounts) - products where mrp > price
 * NOTE: Must come before /:productId to avoid route conflicts
 */
router.get('/offers',optionalAuth, offersProductsQueryValidation, validate, getOffersProducts)

/**
 * GET /api/v1/products/shop-by-need
 * Get products belonging to categories marked as SPECIAL
 * NOTE: Must come before /:productId to avoid route conflicts
 */
router.get('/shop-by-need', optionalAuth, productsQueryValidation, validate, getShopByNeedProducts)

/**
 * GET /api/v1/products/daily-deals
 * Get daily deals or highly discounted products
 * NOTE: Must come before /:productId to avoid route conflicts
 */
router.get('/daily-deals', optionalAuth, productsQueryValidation, validate, getDailyDealsProducts)

/**
 * GET /api/v1/products/flash-deals
 * Get ONLY active limited time flash deals with countdown timers
 * NOTE: Must come before /:productId to avoid route conflicts
 */
router.get('/flash-deals', optionalAuth, productsQueryValidation, validate, getFlashDealsProducts)

/**
 * GET /api/v1/products/weekly-specials
 * Get weekly special products
 * NOTE: Must come before /:productId to avoid route conflicts
 */
router.get('/weekly-specials', optionalAuth, productsQueryValidation, validate, getWeeklySpecialsProducts)

/**
 * GET /api/v1/products/:productId
 * Get product by ID (product detail)
 * NOTE: Must come after specific routes to avoid conflicts
 */
router.get('/:productId',optionalAuth, productsQueryValidation, validate, getProductById)

/**
 * GET /api/v1/products/:productId/similar
 * Get similar products belonging to the same Category / Subcategory
 */
router.get('/:productId/similar', optionalAuth, getSimilarProductsById)

export default router
