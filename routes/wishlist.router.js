import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import {
  addToWishlist,
  getWishlist,
  removeFromWishlist,
  restoreWishlistItem,
  updateWishlistItem,
  clearWishlist
} from '../controllers/wishlistController.js'

import {
  wishlistItemValidation,
  productIdParamValidation
} from '../validations/wishlistValidations.js'

const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors)
  }
  next()
}

const router = express.Router()

// -----------------------------------------
// ADD SINGLE ITEM TO WISHLIST
// -----------------------------------------
router.post(
  '/add',
  authMiddleware,
  wishlistItemValidation,
  validate,
  addToWishlist
)

// -----------------------------------------
// GET USER'S ACTIVE WISHLIST ITEMS
// -----------------------------------------
router.get(
  '/',
  authMiddleware,
  getWishlist
)

// -----------------------------------------
// REMOVE ITEM BY productId
// -----------------------------------------
router.delete(
  '/remove/:productId',
  authMiddleware,
  productIdParamValidation,
  validate,
  removeFromWishlist
)

// -----------------------------------------
// RESTORE REMOVED ITEM BY productId
// -----------------------------------------
router.post(
  '/restore/:productId',
  authMiddleware,
  productIdParamValidation,
  validate,
  restoreWishlistItem
)

// -----------------------------------------
// UPDATE WISHLIST ITEM BY productId
// -----------------------------------------
router.put(
  '/:productId',
  authMiddleware,
  productIdParamValidation,
  validate,
  updateWishlistItem
)

// -----------------------------------------
// CLEAR WISHLIST (Soft Delete)
// -----------------------------------------
router.patch(
  '/clear',
  authMiddleware,
  clearWishlist
)

export default router
