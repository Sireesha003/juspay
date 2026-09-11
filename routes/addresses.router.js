/**
 * Addresses API - Address Management
 *
 * This router handles all address-related operations including:
 * - Getting user's addresses
 * - Creating new address
 * - Updating address
 * - Deleting address
 * - Setting default address
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import addressesRouter from './routes/addresses.router.js';
 *    app.use('/api/v1/addresses', addressesRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import {
  addressBodyValidation,
  addressIdValidation
} from '../validations/addressesValidation.js'
import {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
} from '../controllers/addressesController.js'
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

// All address routes require authentication
router.use(authMiddleware)

/**
 * GET /api/v1/addresses
 * Get user's addresses
 */
router.get('/', getAddresses)

/**
 * POST /api/v1/addresses
 * Create new address
 */
router.post('/', addressBodyValidation, validate, createAddress)

/**
 * PATCH /api/v1/addresses/:addressId
 * Update address
 */
router.patch(
  '/:addressId',
  [...addressIdValidation, ...addressBodyValidation],
  validate,
  updateAddress
)

/**
 * DELETE /api/v1/addresses/:addressId
 * Delete address
 */
router.delete('/:addressId', addressIdValidation, validate, deleteAddress)

/**
 * PATCH /api/v1/addresses/:addressId/set-default
 * Set address as default
 */
router.patch(
  '/:addressId/set-default',
  addressIdValidation,
  validate,
  setDefaultAddress
)

export default router
