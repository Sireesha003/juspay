/**
 * Cart API - Shopping Cart Management
 *
 * This router handles all cart-related operations including:
 * - Getting user's cart
 * - Adding items to cart
 * - Updating cart item quantities
 * - Removing items from cart
 * - Clearing cart
 * - Getting cart summary
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import cartRouter from './routes/cart.router.js';
 *    app.use('/api/v1/cart', cartRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import {
  addCartItemValidation,
  updateCartItemValidation,
  removeCartItemValidation,
  applyCouponValidation
} from '../validations/cartValidation.js'
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
  getCartSummary,
  validateCart,
  applyCouponToCart,
  removeCouponFromCart
} from '../controllers/cartController.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import {
  resolveCartWarehouse,
  requireCartWarehouse
} from '../middlewares/cartWarehouseMiddleware.js'

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

// All cart routes require authentication
router.use(authMiddleware)
router.use(resolveCartWarehouse)
router.use(requireCartWarehouse)

/**
 * GET /api/v1/cart
 * Get user's cart with all items
 */
router.get('/', getCart)

/**
 * GET /api/v1/cart/summary
 * Get cart summary (item count, subtotal, etc.)
 */
router.get('/summary', getCartSummary)

/**
 * GET /api/v1/cart/validate
 * Validate cart before checkout
 */
router.get('/validate', validateCart)

/**
 * POST /api/v1/cart/items
 * Add item to cart
 */
router.post('/items', addCartItemValidation, validate, addCartItem)

/**
 * PATCH /api/v1/cart/items/:itemId
 * Update cart item quantity
 */
router.patch('/items/:itemId', updateCartItemValidation, validate, updateCartItem)

/**
 * DELETE /api/v1/cart/items/:itemId
 * Remove item from cart
 */
router.delete('/items/:itemId', removeCartItemValidation, validate, removeCartItem)

/**
 * DELETE /api/v1/cart
 * Clear entire cart
 */
router.delete('/', clearCart)

/**
 * POST /api/v1/cart/apply-coupon
 * Apply coupon to cart
 */
router.post('/apply-coupon', applyCouponValidation, validate, applyCouponToCart)

/**
 * DELETE /api/v1/cart/coupon
 * Remove applied coupon from cart
 */
router.delete('/coupon', removeCouponFromCart)

export default router

