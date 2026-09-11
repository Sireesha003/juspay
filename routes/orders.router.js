/**
 * Orders API - Order Management
 *
 * This router handles all order-related operations including:
 * - Creating order from cart
 * - Getting user's orders
 * - Getting order details
 * - Cancelling order
 * - Tracking order status
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import ordersRouter from './routes/orders.router.js';
 *    app.use('/api/v1/orders', ordersRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import {
  createOrderValidation,
  orderIdValidation,
  orderIdItemIdValidation,
  orderListValidation,
  slotsAvailabilityValidation,
  modifyDeliveryValidation,
  updateLocationValidation,
  modifyOrderItemsValidation
} from '../validations/ordersValidation.js'
import {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  trackOrder,
  getLiveTracking,
  getOrderTrackingHistory,
  updateDeliveryLocation,
  modifyOrderDelivery,
  modifyOrderItems,
  cancelOrderItem,
  reorder,
  getAvailableSlots,
  assignDeliveryAgent,
  confirmOrder
} from '../controllers/ordersController.js'
import { getUserRefunds, getRefundById } from '../controllers/returnsController.js'
import { getOrderInvoice } from '../controllers/invoiceController.js'
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

// All order routes require authentication
router.use(authMiddleware)

/**
 * GET /api/v1/orders/refunds
 * Get refunds for user orders
 */
router.get('/refunds', getUserRefunds)
router.get('/refunds/:refundId', getRefundById)

/**
 * POST /api/v1/orders & POST /api/v1/orders/checkout
 * Create order from cart
 */
router.post('/', createOrderValidation, validate, createOrder)
router.post('/checkout', createOrderValidation, validate, createOrder)

/**
 * GET /api/v1/orders
 * Get user's orders with filters
 */
router.get('/', orderListValidation, validate, getOrders)

/**
 * GET /api/v1/orders/slots/availability
 * Get available delivery slots for a date and warehouse (must be before /:orderId)
 */
router.get('/slots/availability', slotsAvailabilityValidation, validate, getAvailableSlots)

/**
 * Cancel order endpoints (MUST be placed before GET /:orderId)
 * Supports POST, PATCH, PUT and /cancel/:orderId aliases for backward compatibility.
 */
router.post('/:orderId/cancel', orderIdValidation, validate, cancelOrder)
router.patch('/:orderId/cancel', orderIdValidation, validate, cancelOrder)
router.put('/:orderId/cancel', orderIdValidation, validate, cancelOrder)
router.post('/cancel/:orderId', orderIdValidation, validate, cancelOrder)
router.patch('/cancel/:orderId', orderIdValidation, validate, cancelOrder)

/**
 * GET /api/v1/orders/:orderId/live-tracking
 * Alias for tracking/live (canonical path for new clients)
 */
router.get('/:orderId/live-tracking', orderIdValidation, validate, getLiveTracking)

/**
 * GET /api/v1/orders/:orderId/tracking-history
 * Order tracking events + location history (paginated)
 */
router.get('/:orderId/tracking-history', orderIdValidation, validate, getOrderTrackingHistory)

/**
 * GET /api/v1/orders/:orderId/tracking
 * Track order status (static timeline)
 */
router.get('/:orderId/tracking', orderIdValidation, validate, trackOrder)

/**
 * GET /api/v1/orders/:orderId/tracking/live
 * Get real-time order tracking with live location and ETA
 */
router.get('/:orderId/tracking/live', orderIdValidation, validate, getLiveTracking)

/**
 * POST /api/v1/orders/:orderId/tracking/location
 * Update delivery agent location (for delivery agents)
 */
router.post('/:orderId/tracking/location', [...orderIdValidation, ...updateLocationValidation], validate, updateDeliveryLocation)

/**
 * PATCH /api/v1/orders/:orderId/delivery
 * Modify scheduled order delivery slot/date
 */
router.patch('/:orderId/delivery', [...orderIdValidation, ...modifyDeliveryValidation], validate, modifyOrderDelivery)

/**
 * PATCH /api/v1/orders/:orderId/items
 * Modify order items (add/remove/update)
 */
router.patch('/:orderId/items', [...orderIdValidation, ...modifyOrderItemsValidation], validate, modifyOrderItems)

/**
 * POST /api/v1/orders/:orderId/items/:itemId/cancel
 * Cancel specific order item (partial cancellation)
 */
router.post('/:orderId/items/:itemId/cancel', orderIdItemIdValidation, validate, cancelOrderItem)

/**
 * POST /api/v1/orders/:orderId/reorder
 * Reorder from previous order
 */
router.post('/:orderId/reorder', orderIdValidation, validate, reorder)

/**
 * GET /api/v1/orders/:orderId/invoice
 * Get order invoice
 */
router.get('/:orderId/invoice', orderIdValidation, validate, getOrderInvoice)

/**
 * POST /api/v1/orders/:orderId/assign-agent
 * Assign delivery agent to order (for admins/warehouse staff)
 */
router.post('/:orderId/assign-agent', orderIdValidation, validate, assignDeliveryAgent)

/**
 * POST /api/v1/orders/:orderId/confirm
 * Confirm order (for warehouse staff)
 */
router.post('/:orderId/confirm', orderIdValidation, validate, confirmOrder)

/**
 * GET /api/v1/orders/:orderId
 * Get order details (generic parameter route — MUST be placed AFTER all specific sub-routes)
 */
router.get('/:orderId', orderIdValidation, validate, getOrderById)

export default router

