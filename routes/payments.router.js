/**
 * Payments API - Payment Processing
 *
 * This router handles all payment-related operations including:
 * - Initiating payment
 * - Verifying payment
 * - Handling Razorpay webhooks
 * - Getting payment status
 * - Retrying failed payments
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import paymentsRouter from './routes/payments.router.js';
 *    app.use('/api/v1/payments', paymentsRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import {
  initiatePaymentValidation,
  verifyPaymentValidation,
  verifyJuspayPaymentValidation,
  paymentIdValidation,
  razorpayWebhookValidation,
  juspayWebhookValidation,
  addSavedPaymentMethodValidation,
  savedPaymentMethodIdValidation
} from '../validations/paymentsValidation.js'
import {
  initiatePayment,
  verifyPayment,
  verifyJuspayPayment,
  razorpayWebhook,
  juspayWebhook,
  getPaymentStatus,
  retryPayment,
  getSavedPaymentMethods,
  addSavedPaymentMethod,
  deleteSavedPaymentMethod,
  setDefaultSavedPaymentMethod
} from '../controllers/paymentsController.js'
import { getUserRefunds, getRefundById } from '../controllers/returnsController.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { idempotencyMiddleware } from '../middlewares/idempotencyMiddleware.js'

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
 * POST /api/v1/payments/razorpay/webhook
 * Razorpay webhook (no auth required - uses signature verification)
 */
router.post('/razorpay/webhook', idempotencyMiddleware('razorpay-webhook'), razorpayWebhookValidation, validate, razorpayWebhook)

/**
 * POST /api/v1/payments/juspay/webhook
 * Juspay webhook (no auth required - uses signature verification)
 */
router.post('/juspay/webhook', idempotencyMiddleware('juspay-webhook'), juspayWebhookValidation, validate, juspayWebhook)

// All other payment routes require authentication
router.use(authMiddleware)

/**
 * GET /api/v1/payments/refunds
 * Get refunds for payment
 */
router.get('/refunds', getUserRefunds)
router.get('/refunds/:refundId', getRefundById)

/**
 * POST /api/v1/payments/initiate
 * Initiate payment for an order
 */
router.post('/initiate', initiatePaymentValidation, validate, initiatePayment)

/**
 * POST /api/v1/payments/verify
 * Verify Razorpay payment
 */
router.post('/verify', verifyPaymentValidation, validate, verifyPayment)

/**
 * POST /api/v1/payments/juspay/verify
 * Verify Juspay payment
 */
router.post('/juspay/verify', verifyJuspayPaymentValidation, validate, verifyJuspayPayment)

/**
 * Direct payment failure and cancellation endpoints
 */
router.post('/fail', verifyPaymentValidation, validate, (req, res, next) => {
  req.body.paymentStatus = 'FAILED'
  return verifyPayment(req, res, next)
})
router.post('/cancel', verifyPaymentValidation, validate, (req, res, next) => {
  req.body.paymentStatus = 'FAILED'
  return verifyPayment(req, res, next)
})
router.post('/:orderId/fail', (req, res, next) => {
  req.body = { ...req.body, orderId: req.params.orderId, paymentStatus: 'FAILED' }
  return verifyPayment(req, res, next)
})
router.post('/:orderId/cancel', (req, res, next) => {
  req.body = { ...req.body, orderId: req.params.orderId, paymentStatus: 'FAILED' }
  return verifyPayment(req, res, next)
})

/**
 * GET /api/v1/payments/:paymentId
 * Get payment status
 */
router.get('/:paymentId', paymentIdValidation, validate, getPaymentStatus)

/**
 * POST /api/v1/payments/:paymentId/retry
 * Retry failed payment
 */
router.post('/:paymentId/retry', paymentIdValidation, validate, retryPayment)

/**
 * Saved payment methods routes
 */
router.get('/saved', getSavedPaymentMethods)
router.post('/saved', addSavedPaymentMethodValidation, validate, addSavedPaymentMethod)
router.delete('/saved/:id', savedPaymentMethodIdValidation, validate, deleteSavedPaymentMethod)
router.patch('/saved/:id/default', savedPaymentMethodIdValidation, validate, setDefaultSavedPaymentMethod)

export default router

