/**
 * Returns API - Order Returns and Refunds
 *
 * This router handles all return-related operations including:
 * - Initiating return requests
 * - Getting return status
 * - Getting user's returns
 * - Cancelling return requests
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import returnsRouter from './routes/returns.router.js';
 *    app.use('/api/v1', returnsRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import {
  initiateReturnValidation,
  getUserReturnsValidation,
  returnIdValidation,
  orderIdValidation
} from '../validations/returnsValidation.js'
import {
  initiateReturn,
  getReturnStatus,
  getUserReturns,
  cancelReturn,
  getUserRefunds,
  getRefundById
} from '../controllers/returnsController.js'
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

// Return routes require authentication (applied per route to avoid root-path interception)

/**
 * GET /api/v1/refunds
 * Get user's complete refund history (including cancelled online orders, return refunds, and gateway refunds)
 */
router.get('/refunds', authMiddleware, getUserRefunds)
router.get('/refunds/:refundId', authMiddleware, getRefundById)
router.get('/user/refunds', authMiddleware, getUserRefunds)
router.get('/orders/refunds', authMiddleware, getUserRefunds)

/**
 * POST /api/v1/orders/:orderId/returns
 * Initiate return request
 */
router.post('/orders/:orderId/returns', authMiddleware, initiateReturnValidation, validate, initiateReturn)
router.post('/orders/:orderId/return', authMiddleware, initiateReturnValidation, validate, initiateReturn) // Alias for singular path

/**
 * GET /api/v1/orders/:orderId/returns
 * Get return status for an order
 */
router.get('/orders/:orderId/returns', authMiddleware, orderIdValidation, validate, getReturnStatus)

/**
 * GET /api/v1/returns
 * Get user's return requests
 */
router.get('/returns', authMiddleware, getUserReturnsValidation, validate, getUserReturns)

/**
 * POST /api/v1/returns/:returnId/cancel
 * Cancel return request
 */
router.post('/returns/:returnId/cancel', authMiddleware, returnIdValidation, validate, cancelReturn)

export default router

