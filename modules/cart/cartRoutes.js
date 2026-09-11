// modules/cart/cartRoutes.js
import express from 'express'
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
} from './cartController.js'
import {
  addCartItemValidation,
  updateCartItemValidation,
  removeCartItemValidation,
  applyCouponValidation
} from '../../validations/cartValidation.js'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../../utils/responseHelper.js'
import { authMiddleware } from '../../middlewares/authMiddleware.js'
import { resolveCartWarehouse, requireCartWarehouse } from '../../middlewares/cartWarehouseMiddleware.js'

const router = express.Router()

const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors)
  }
  next()
}

router.use(authMiddleware)
router.use(resolveCartWarehouse)
router.use(requireCartWarehouse)

// GET user cart
router.get('/', getCart)

// POST /cart - Add item to cart
router.post('/', addCartItemValidation, validate, addCartItem)

// PUT /cart/:itemId - Update item quantity
router.put('/:itemId', updateCartItemValidation, validate, updateCartItem)

// DELETE /cart/:itemId - Remove item from cart
router.delete('/:itemId', removeCartItemValidation, validate, removeCartItem)

// DELETE / - Clear entire cart
router.delete('/', clearCart)

// --- Legacy / Compatibility Routes ---
router.get('/summary', getCartSummary)
router.get('/validate', validateCart)
router.post('/items', addCartItemValidation, validate, addCartItem)
router.patch('/items/:itemId', updateCartItemValidation, validate, updateCartItem)
router.delete('/items/:itemId', removeCartItemValidation, validate, removeCartItem)
router.post('/coupon', applyCouponValidation, validate, applyCouponToCart)
router.delete('/coupon', removeCouponFromCart)

export default router
