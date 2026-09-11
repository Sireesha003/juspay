import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { releaseReservation } from '../services/reservationService.js'
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  capturePayment
} from '../utils/razorpayUtils.js'
import {
  createJuspaySession,
  getJuspayOrderStatus,
  verifyJuspayWebhookSignature,
  createJuspayRefund
} from '../utils/juspayUtils.js'
import { sendPaymentNotification, sendOrderNotification } from '../utils/notificationService.js'
import { emitCanonicalEvent } from '../audit/auditLogger.js'
import { CANONICAL_EVENTS } from '../audit/auditConstants.js'
import { saveFailedCreateOrderMirror } from '../services/createOrderDeliveryMirrorRetryService.js'
import { releaseSlot } from '../services/deliverySlotService.js'
import { releasePickupSlot } from '../services/pickupSlotService.js'

const DELIVERY_API_BASE_URL = (
  process.env.DELIVERY_API_BASE_URL || 'http://localhost:3003/api/v1'
).replace(/\/$/, '')
const DELIVERY_API_SYNC_KEY = process.env.DELIVERY_API_SYNC_KEY || ''

async function callDeliveryApi({ path, method = 'POST', token, body, useSyncKey = false }) {
  const response = await fetch(`${DELIVERY_API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(useSyncKey && DELIVERY_API_SYNC_KEY
        ? { 'x-internal-sync-key': DELIVERY_API_SYNC_KEY }
        : {}),
      ...(!useSyncKey && token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err = new Error(payload?.message || `Delivery API call failed: ${response.status}`)
    err.statusCode = response.status
    throw err
  }
  return payload
}

/**
 * Format payment for response
 */
function formatPayment(payment) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    method: payment.method,
    amount: payment.amount,
    status: payment.status,
    gateway: payment.gateway || (payment.method?.startsWith('JUSPAY') ? 'JUSPAY' : 'RAZORPAY'),
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId,
    juspayOrderId: payment.juspayOrderId,
    juspayPaymentId: payment.juspayPaymentId,
    juspayStatus: payment.juspayStatus,
    codCollected: payment.codCollected,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
  }
}

function emitPaymentUpdatedEvent({
  paymentId,
  orderId,
  fromStatus,
  toStatus,
  method,
  razorpayPaymentId = null,
  juspayPaymentId = null,
  eventId = null,
  actorId = null,
  actorRole = null
}) {
  const stableEventId =
    eventId ||
    `PAYMENT_UPDATED:${paymentId}:${toStatus || 'UNKNOWN'}:${razorpayPaymentId || juspayPaymentId || 'NO_GATEWAY_PAYMENT'}`

  void emitCanonicalEvent({
    eventName: CANONICAL_EVENTS.paymentUpdated,
    entityType: 'PAYMENT',
    entityId: paymentId,
    action: 'UPDATED',
    payload: {
      orderId,
      method,
      fromStatus,
      toStatus,
      razorpayPaymentId,
      juspayPaymentId,
      actorId,
      actorRole
    },
    beforeJson: { status: fromStatus ?? null },
    afterJson: { status: toStatus ?? null },
    eventId: stableEventId
  }).catch(() => {})
}

async function markOrderAsPlaced(orderId, currentStatus, userId) {
  if (currentStatus === 'PLACED') return

  try {
    /**
     * First update order status in DB.
     * This is the main required change.
     */
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PLACED'
      },
      include: {
        items: true,
        address: true
      }
    })

    logger.info('[Payments] Order status updated to PLACED', {
      orderId,
      fromStatus: currentStatus
    })

    // Release/fulfill reservation
    await releaseReservation({ orderId, status: 'COMPLETED' })

    // Sync to Delivery API mirror upon placement
    try {
      await callDeliveryApi({
        path: '/order/create-order',
        method: 'POST',
        useSyncKey: true,
        body: {
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          consumerId: updatedOrder.consumerId,
          addressId: updatedOrder.addressId,
          warehouseId: updatedOrder.warehouseId,
          totalAmount: Number(updatedOrder.totalAmount || 0),
          deliveryDate: updatedOrder.deliveryDate,
          specialInstructions: updatedOrder.specialInstructions,
          orderItems: (updatedOrder.items || []).map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: Number(item.unitPrice || 0),
            totalPrice: Number(item.totalPrice || 0)
          }))
        }
      })
    } catch (syncError) {
      logger.error('[Payments] Delivery API create-order sync failed on order placement', {
        orderId,
        error: syncError.message
      })
      await saveFailedCreateOrderMirror({
        orderId: updatedOrder.id,
        body: {
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          consumerId: updatedOrder.consumerId,
          addressId: updatedOrder.addressId,
          warehouseId: updatedOrder.warehouseId,
          totalAmount: Number(updatedOrder.totalAmount || 0),
          deliveryDate: updatedOrder.deliveryDate,
          specialInstructions: updatedOrder.specialInstructions,
          orderItems: (updatedOrder.items || []).map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: Number(item.unitPrice || 0),
            totalPrice: Number(item.totalPrice || 0)
          }))
        },
        errorMessage: syncError.message
      })
    }

    /**
     * Then trigger realtime/notification side-effects.
     * If this fails, order status should still remain PLACED.
     */
    try {
      const { queueOrderStatusChange } = await import('../jobs/orderStatusProcessor.js')

      await queueOrderStatusChange(
        orderId,
        currentStatus,
        'PLACED',
        userId
      )
    } catch (eventError) {
      logger.error('[Payments] Failed to process order status side-effects', {
        orderId,
        fromStatus: currentStatus,
        toStatus: 'PLACED',
        error: eventError.message
      })
    }
  } catch (error) {
    logger.error('[Payments] Failed to update order status to PLACED', {
      orderId,
      fromStatus: currentStatus,
      error: error.message
    })

    throw error
  }
}

export async function cancelOrderOnPaymentFailure(orderId, userId = null, failureReason = 'Payment failed') {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payment: true
      }
    })

    if (!order) {
      logger.warn('[Payments] Order not found to cancel on payment failure', { orderId })
      return null
    }

    if (order.status === 'CANCELLED') {
      return {
        updatedOrder: order,
        updatedPayment: order.payment,
        previousOrderStatus: order.status,
        previousPaymentStatus: order.payment?.status
      }
    }

    const previousOrderStatus = order.status
    const previousPaymentStatus = order.payment?.status

    // 1. Update payment status to FAILED
    let updatedPayment = null
    if (order.payment) {
      updatedPayment = await tx.payment.update({
        where: { id: order.payment.id },
        data: {
          status: 'FAILED'
        }
      })
    }

    // 2. Update order status to CANCELLED
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: failureReason,
        failureReason: failureReason
      }
    })

    // 3. Mark delivery as FAILED
    await tx.delivery.updateMany({
      where: { orderId: order.id },
      data: { status: 'FAILED' }
    })

    // 4. Restore inventory stock
    for (const item of order.items) {
      if (item.isCancelled) continue
      if (item.productVariantId) {
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { stockQuantity: { increment: item.quantity } }
        })
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } }
        })
      }
    }

    // 5. Release delivery slot & pickup slot
    await releaseSlot(tx, order)
    if (order.pickupSlotId) {
      await releasePickupSlot(tx, order)
    }

    // 6. Rollback coupon redemptions if any
    const redemptions = await tx.couponRedemption.findMany({ where: { orderId: order.id } })
    for (const r of redemptions) {
      await tx.coupon.update({
        where: { id: r.couponId },
        data: { totalUses: { decrement: 1 } }
      })
    }
    await tx.couponRedemption.deleteMany({ where: { orderId: order.id } })

    // 7. Record status history
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: previousOrderStatus,
        toStatus: 'CANCELLED',
        changedBy: userId,
        reason: failureReason
      }
    })

    return {
      updatedPayment,
      updatedOrder,
      previousOrderStatus,
      previousPaymentStatus
    }
  })
}

export async function markOrderAsPaymentFailed(orderId, currentStatus, failureReason = 'Payment failed') {
  if (currentStatus === 'CANCELLED') return

  try {
    const result = await cancelOrderOnPaymentFailure(orderId, null, failureReason)
    if (result) {
      // Release/cancel reservation
      await releaseReservation({ orderId, status: 'CANCELLED' })

      try {
        const { orchestratePostStatusPersist } = await import('../services/orchestration/orderLifecycleOrchestrator.js')
        await orchestratePostStatusPersist({
          orderId,
          status: 'CANCELLED',
          previousStatus: result.previousOrderStatus || currentStatus,
          source: 'PAYMENT_FAILURE',
          recordStatusHistory: false,
          cancellationReason: failureReason
        })
      } catch (orchErr) {
        logger.error('[Payments] Failed to orchestrate payment failure side effects', { orderId, error: orchErr.message })
      }
    }
    logger.info('[Payments] Order cancelled on payment failure', { orderId, fromStatus: currentStatus })
  } catch (error) {
    logger.error('[Payments] Failed to cancel order on payment failure', {
      orderId,
      fromStatus: currentStatus,
      error: error.message
    })
  }
}

function buildLineFingerprint(lines = []) {
  const map = new Map()
  for (const line of lines) {
    const productId = line?.productId
    if (!productId) continue
    const variantId = line?.productVariantId || 'NO_VARIANT'
    const qty = Number(line?.quantity || 0)
    if (qty <= 0) continue
    const key = `${productId}::${variantId}`
    map.set(key, (map.get(key) || 0) + qty)
  }
  return map
}

function areFingerprintsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const [key, qty] of a.entries()) {
    if (b.get(key) !== qty) return false
  }
  return true
}

async function clearCartOnSuccessfulPaymentIfUnchanged(orderId, userId, reason) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      consumerId: true,
      warehouseId: true,
      items: {
        where: { isCancelled: false },
        select: {
          productId: true,
          productVariantId: true,
          quantity: true
        }
      }
    }
  })

  if (!order || !order.warehouseId || order.consumerId !== userId) return

  const cart = await prisma.cart.findFirst({
    where: { userId, warehouseId: order.warehouseId },
    select: {
      id: true,
      items: {
        select: {
          id: true,
          productId: true,
          productVariantId: true,
          quantity: true
        }
      }
    }
  })
  if (!cart) return

  const orderFp = buildLineFingerprint(order.items)
  const cartFp = buildLineFingerprint(cart.items)

  // Clear only when cart is unchanged from the ordered lines.
  if (!areFingerprintsEqual(orderFp, cartFp)) {
    logger.info('[Payments] Skipping cart clear because cart changed after checkout', {
      orderId,
      userId,
      cartId: cart.id,
      reason
    })
    return
  }

  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { cartId: cart.id } }),
    prisma.cart.update({
      where: { id: cart.id },
      data: {
        appliedCouponId: null,
        appliedCouponCode: null,
        taxAmount: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        taxableAmount: 0
      }
    })
  ])

  logger.info('[Payments] Cleared cart after successful payment', {
    orderId,
    userId,
    cartId: cart.id,
    reason
  })
}

/**
 * POST /api/v1/payments/initiate
 * Initiate payment for an order
 */
export const initiatePayment = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId, method } = req.body

  logger.info('[Payments] Initiating payment', { userId, orderId, method })

  // Get order
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true,
      consumer: true
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  if (order.status === 'CANCELLED') {
    return errorResponse(res, 400, 'Cannot pay for a cancelled order')
  }

  if (order.status === 'DELIVERED') {
    return errorResponse(res, 400, 'Order is already delivered')
  }

  // Handle COD
  if (method === 'COD') {
    // For COD, payment is already created with PENDING status
    if (order.payment) {
      const updatedPayment = await prisma.payment.update({
        where: { id: order.payment.id },
        data: {
          method: 'COD',
          status: 'PENDING' // COD will be collected on delivery
        }
      })
      
      // Try standard flow which may queue status change when order is PENDING
      await markOrderAsPlaced(order.id, order.status, userId)

      // Ensure order is marked PLACED immediately for COD initiation —
      // some setups queue PENDING->PLACED transitions, which delays UX expectations.
      try {
        const freshOrder = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } })
        if (freshOrder && freshOrder.status !== 'PLACED') {
          await prisma.order.update({ where: { id: order.id }, data: { status: 'PLACED' } })
          logger.info('[Payments] Order status force-updated to PLACED for COD', { orderId: order.id, fromStatus: freshOrder.status })
        }
      } catch (err) {
        logger.error('[Payments] Failed to force-update order status to PLACED for COD', { orderId: order.id, error: err.message })
      }

      emitPaymentUpdatedEvent({
        paymentId: updatedPayment.id,
        orderId,
        fromStatus: order.payment?.status,
        toStatus: updatedPayment.status,
        razorpayPaymentId: updatedPayment.razorpayPaymentId || null,
        method: updatedPayment.method,
        actorId: userId,
        actorRole: req.user?.role || null
      })

      await clearCartOnSuccessfulPaymentIfUnchanged(
        orderId,
        userId,
        'cod_initiated'
      )

      logger.info('[Payments] COD payment initiated', { userId, orderId })

      return successResponse(res, 200, {
        payment: formatPayment(updatedPayment),
        orderStatus: 'PLACED'
      }, 'Payment initiated successfully (COD)')
    }
  }

  // Handle online payments (Razorpay)
  const razorpayMethods = ['RAZORPAY_UPI', 'RAZORPAY_CARD', 'RAZORPAY_NETBANKING']
  
  if (razorpayMethods.includes(method)) {
    // Check if payment already exists
    let payment = order.payment

    if (!payment) {
      return errorResponse(res, 400, 'Payment record not found for this order')
    }

    // Create Razorpay order
    try {
      const razorpayOrder = await createRazorpayOrder(
        order.totalAmount,
        'INR',
        order.orderNumber
      )

      // Update payment with Razorpay order ID
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          method: method,
          razorpayOrderId: razorpayOrder.id
        }
      })

      logger.info('[Payments] Razorpay order created', {
        userId,
        orderId,
        razorpayOrderId: razorpayOrder.id
      })

      return successResponse(res, 200, {
        payment: formatPayment(payment),
        razorpay: {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount / 100, // Convert from paise to rupees
          currency: razorpayOrder.currency,
          key: process.env.RAZORPAY_KEY_ID // Frontend needs this for Razorpay checkout
        }
      }, 'Payment initiated successfully')
    } catch (error) {
      logger.error('[Payments] Error creating Razorpay order', {
        error: error.message,
        orderId
      })
      return errorResponse(res, 500, 'Failed to initiate payment. Please try again.')
    }
  }

  // Handle online payments (Juspay Hypercheckout)
  const juspayMethods = ['JUSPAY', 'JUSPAY_UPI', 'JUSPAY_CARD', 'JUSPAY_NETBANKING']

  if (juspayMethods.includes(method)) {
    let payment = order.payment

    if (!payment) {
      return errorResponse(res, 400, 'Payment record not found for this order')
    }

    try {
      const session = await createJuspaySession({
        orderId: order.orderNumber,
        amount: order.totalAmount,
        customerId: order.consumerId || userId,
        customerEmail: order.consumer?.email || req.user?.email,
        customerPhone: order.consumer?.phone || req.user?.phone,
        returnUrl:
          req.body.returnUrl ||
          `${process.env.FRONTEND_URL || 'https://villagkart.com'}/orders/${order.id}/payment-status`
      })

      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          method: method,
          gateway: 'JUSPAY',
          juspayOrderId: session.order_id || order.orderNumber,
          juspayStatus: session.status || 'NEW'
        }
      })

      logger.info('[Payments] Juspay session created', {
        userId,
        orderId,
        orderNumber: order.orderNumber,
        juspayOrderId: session.order_id || order.orderNumber
      })

      return successResponse(
        res,
        200,
        {
          payment: formatPayment(payment),
          juspay: {
            orderId: session.order_id || order.orderNumber,
            status: session.status || 'NEW',
            sdkPayload: session.sdk_payload || {},
            paymentLinks: session.payment_links || {}
          }
        },
        'Payment initiated successfully (Juspay)'
      )
    } catch (error) {
      logger.error('[Payments] Error creating Juspay session', {
        error: error.message,
        orderId
      })
      return errorResponse(
        res,
        500,
        'Failed to initiate payment with Juspay. Please try again.'
      )
    }
  }

  return errorResponse(res, 400, 'Invalid payment method')
})

/**
 * POST /api/v1/payments/verify
 * Verify Razorpay payment
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const userId = req.user.id

  const {
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    paymentStatus,
    status,
    failureReason
  } = req.body

  const requestedPaymentStatus = String(paymentStatus || status || 'SUCCESS')
    .trim()
    .toUpperCase()

  logger.info('[Payments] Verifying payment', {
    userId,
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    requestedPaymentStatus
  })

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  if (!order.payment) {
    return errorResponse(res, 404, 'Payment not found')
  }

  if (order.status === 'CANCELLED') {
    return errorResponse(res, 400, 'Cannot update payment for cancelled order')
  }

  if (order.status === 'DELIVERED') {
    return errorResponse(res, 400, 'Order is already delivered')
  }

  if (order.payment.status === 'SUCCESS') {
    return successResponse(
      res,
      200,
      {
        payment: formatPayment(order.payment),
        orderStatus: order.status
      },
      'Payment already verified'
    )
  }

  /**
   * CASE 1: PAYMENT FAILED
   * This is called by frontend failure callback.
   * Razorpay failed/cancelled payments may not have a valid signature,
   * so do not verify signature in FAILED case.
   */
  if (requestedPaymentStatus === 'FAILED') {
    const failedReason = failureReason || 'Payment failed'
    const result = await cancelOrderOnPaymentFailure(order.id, userId, failedReason)

    if (result) {
      // Release/cancel reservation
      await releaseReservation({ orderId, status: 'CANCELLED' })

      emitPaymentUpdatedEvent({
        paymentId: result.updatedPayment?.id || order.payment.id,
        orderId,
        fromStatus: result.previousPaymentStatus || order.payment.status,
        toStatus: 'FAILED',
        razorpayPaymentId: razorpayPaymentId || null,
        method: result.updatedPayment?.method || order.payment.method,
        actorId: userId,
        actorRole: req.user?.role || null
      })

      try {
        const { orchestratePostStatusPersist } = await import('../services/orchestration/orderLifecycleOrchestrator.js')
        await orchestratePostStatusPersist({
          orderId,
          status: 'CANCELLED',
          previousStatus: result.previousOrderStatus || order.status,
          source: 'PAYMENT_VERIFICATION_FAILED',
          changedBy: userId,
          recordStatusHistory: false,
          cancellationReason: failedReason
        })
      } catch (orchErr) {
        logger.error('[Payments] Failed to orchestrate payment failure side effects', { orderId, error: orchErr.message })
      }
    }

    logger.warn('[Payments] Payment marked as failed and order cancelled', {
      userId,
      orderId,
      previousOrderStatus: order.status,
      newOrderStatus: 'CANCELLED',
      failureReason: failedReason
    })

    return successResponse(
      res,
      200,
      {
        payment: result?.updatedPayment ? formatPayment(result.updatedPayment) : formatPayment(order.payment),
        orderStatus: 'CANCELLED',
        failureReason: failedReason
      },
      'Payment failed and order cancelled successfully'
    )
  }

  /**
   * CASE 2: PAYMENT SUCCESS
   */
  if (requestedPaymentStatus !== 'SUCCESS') {
    return errorResponse(res, 400, 'Invalid payment status')
  }

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return errorResponse(
      res,
      400,
      'razorpayOrderId, razorpayPaymentId and razorpaySignature are required for successful payment verification'
    )
  }

  const isValid = verifyPaymentSignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  )

  if (!isValid) {
    logger.warn('[Payments] Invalid payment signature', {
      orderId,
      razorpayOrderId,
      razorpayPaymentId
    })

    // Cancel order on invalid payment signature
    const cancelResult = await cancelOrderOnPaymentFailure(order.id, userId, 'Invalid payment signature')
    if (cancelResult) {
      await releaseReservation({ orderId: order.id, status: 'CANCELLED' })
      try {
        const { orchestratePostStatusPersist } = await import('../services/orchestration/orderLifecycleOrchestrator.js')
        await orchestratePostStatusPersist({
          orderId: order.id,
          status: 'CANCELLED',
          previousStatus: order.status,
          source: 'PAYMENT_SIGNATURE_INVALID',
          changedBy: userId,
          recordStatusHistory: false,
          cancellationReason: 'Invalid payment signature'
        })
      } catch (_) {}
    }

    return errorResponse(res, 400, 'Invalid payment signature')
  }

  const previousPaymentStatus = order.payment.status

  const payment = await prisma.payment.update({
    where: { id: order.payment.id },
    data: {
      status: 'SUCCESS',
      razorpayOrderId: razorpayOrderId || order.payment.razorpayOrderId,
      razorpayPaymentId: razorpayPaymentId || order.payment.razorpayPaymentId || null
    }
  })

  await markOrderAsPlaced(order.id, order.status, userId)

  emitPaymentUpdatedEvent({
    paymentId: payment.id,
    orderId,
    fromStatus: previousPaymentStatus,
    toStatus: payment.status,
    razorpayPaymentId: payment.razorpayPaymentId || null,
    method: payment.method,
    actorId: userId,
    actorRole: req.user?.role || null
  })

  logger.info('[Payments] Payment verified successfully', {
    userId,
    orderId
  })

  await clearCartOnSuccessfulPaymentIfUnchanged(
    orderId,
    userId,
    'verify_payment_success'
  )

  return successResponse(
    res,
    200,
    {
      payment: formatPayment(payment),
      orderStatus: 'PLACED'
    },
    'Payment verified successfully'
  )
})

/**
 * POST /api/v1/payments/juspay/verify
 * Verify Juspay payment (server-to-server)
 */
export const verifyJuspayPayment = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId, juspayOrderId } = req.body

  logger.info('[Payments] Verifying Juspay payment', {
    userId,
    orderId,
    juspayOrderId
  })

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  if (!order.payment) {
    return errorResponse(res, 404, 'Payment record not found')
  }

  if (order.status === 'CANCELLED') {
    return errorResponse(res, 400, 'Cannot verify payment for a cancelled order')
  }

  if (order.status === 'DELIVERED') {
    return errorResponse(res, 400, 'Order is already delivered')
  }

  if (order.payment.status === 'SUCCESS') {
    return successResponse(
      res,
      200,
      {
        payment: formatPayment(order.payment),
        orderStatus: order.status
      },
      'Payment already verified'
    )
  }

  const lookupOrderId =
    juspayOrderId || order.payment.juspayOrderId || order.orderNumber

  let juspayOrder
  try {
    juspayOrder = await getJuspayOrderStatus(lookupOrderId)
  } catch (error) {
    logger.error('[Payments] Failed to query Juspay order status', {
      orderId,
      lookupOrderId,
      error: error.message
    })
    return errorResponse(
      res,
      502,
      `Failed to verify payment with Juspay gateway: ${error.message}`
    )
  }

  const juspayStatus = String(juspayOrder?.status || '').toUpperCase()
  const txnId =
    juspayOrder?.txn_id ||
    juspayOrder?.id ||
    juspayOrder?.payment?.id ||
    null

  if (juspayStatus === 'CHARGED') {
    const previousPaymentStatus = order.payment.status

    const updatedPayment = await prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        status: 'SUCCESS',
        gateway: 'JUSPAY',
        juspayOrderId: juspayOrder.order_id || lookupOrderId,
        juspayPaymentId: txnId,
        juspayStatus: 'CHARGED'
      }
    })

    await markOrderAsPlaced(order.id, order.status, userId)

    emitPaymentUpdatedEvent({
      paymentId: updatedPayment.id,
      orderId: order.id,
      fromStatus: previousPaymentStatus,
      toStatus: 'SUCCESS',
      method: updatedPayment.method,
      juspayPaymentId: txnId,
      actorId: userId,
      actorRole: req.user?.role || null
    })

    await clearCartOnSuccessfulPaymentIfUnchanged(
      order.id,
      userId,
      'juspay_verify_success'
    )

    logger.info('[Payments] Juspay payment verified successfully', {
      userId,
      orderId,
      juspayOrderId: lookupOrderId,
      txnId
    })

    return successResponse(
      res,
      200,
      {
        payment: formatPayment(updatedPayment),
        orderStatus: 'PLACED'
      },
      'Payment verified successfully'
    )
  }

  // If status is not CHARGED, handle payment failure
  logger.warn('[Payments] Juspay payment verification not charged', {
    orderId,
    lookupOrderId,
    juspayStatus
  })

  const failureReason = `Juspay payment verification failed: status is ${juspayStatus || 'UNKNOWN'}`
  const cancelResult = await cancelOrderOnPaymentFailure(
    order.id,
    userId,
    failureReason
  )

  if (cancelResult) {
    await releaseReservation({ orderId: order.id, status: 'CANCELLED' })

    emitPaymentUpdatedEvent({
      paymentId: cancelResult.updatedPayment?.id || order.payment.id,
      orderId: order.id,
      fromStatus: cancelResult.previousPaymentStatus || order.payment.status,
      toStatus: 'FAILED',
      method: cancelResult.updatedPayment?.method || order.payment.method,
      juspayPaymentId: txnId,
      actorId: userId,
      actorRole: req.user?.role || null
    })

    try {
      const { orchestratePostStatusPersist } = await import(
        '../services/orchestration/orderLifecycleOrchestrator.js'
      )
      await orchestratePostStatusPersist({
        orderId: order.id,
        status: 'CANCELLED',
        previousStatus: cancelResult.previousOrderStatus || order.status,
        source: 'JUSPAY_VERIFICATION_FAILED',
        changedBy: userId,
        recordStatusHistory: false,
        cancellationReason: failureReason
      })
    } catch (orchErr) {
      logger.error(
        '[Payments] Failed to orchestrate payment failure side effects',
        { orderId: order.id, error: orchErr.message }
      )
    }
  }

  return errorResponse(
    res,
    400,
    `Payment not completed. Juspay status: ${juspayStatus || 'UNKNOWN'}`
  )
})

/**
 * POST /api/v1/payments/razorpay/webhook
 * Handle Razorpay webhook events
 */
export const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature']
  const webhookEventId = req.headers['x-razorpay-event-id']
  const payload = req.body

  logger.info('[Payments] Razorpay webhook received', {
    event: payload.event,
    entity: payload.payload?.payment?.entity?.id,
    webhookEventId: webhookEventId || null
  })

  // Durable replay handling for duplicate webhook deliveries.
  if (webhookEventId) {
    const replay = await prisma.idempotencyRecord.findUnique({
      where: { key_routeKey_userId: { key: String(webhookEventId), routeKey: 'razorpay-webhook-event', userId: 'service:razorpay-webhook' } },
      select: { id: true }
    })
    if (replay) {
      logger.info('[Payments] WEBHOOK_EVENT_REPLAY_IGNORED', { webhookEventId })
      return res.status(200).json({ received: true, replayIgnored: true })
    }
  }

  // Verify webhook signature
  if (signature) {
    const isValid = verifyWebhookSignature(payload, signature)
    if (!isValid) {
      logger.warn('[Payments] Invalid webhook signature')
      return errorResponse(res, 400, 'Invalid webhook signature')
    }
  }

  // Handle payment events
  if (
    payload.event === 'payment.captured' ||
    payload.event === 'payment.authorized' ||
    payload.event === 'payment.failed'
  ) {
    const paymentEntity = payload.payload.payment.entity
    const razorpayOrderId = paymentEntity.order_id
    const razorpayPaymentId = paymentEntity.id
    const status = paymentEntity.status

    // Find payment by Razorpay order ID
    const payment = await prisma.payment.findFirst({
      where: {
        razorpayOrderId: razorpayOrderId
      },
      include: {
        order: true
      }
    })

    if (payment) {
      const nextStatus =
        payload.event === 'payment.failed'
          ? 'FAILED'
          : status === 'captured' || status === 'authorized'
          ? 'SUCCESS'
          : 'FAILED'
      const replayIgnored =
        payment.status === nextStatus &&
        (payment.razorpayPaymentId || null) === (razorpayPaymentId || null)
      if (replayIgnored) {
        logger.info('[Payments] WEBHOOK_REPLAY_IGNORED', {
          paymentId: payment.id,
          orderId: payment.orderId,
          razorpayPaymentId,
          nextStatus
        })
        return res.status(200).json({ received: true, replayIgnored: true })
      }

      // Update payment status
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          razorpayPaymentId: razorpayPaymentId
        }
      })
      emitPaymentUpdatedEvent({
        paymentId: updatedPayment.id,
        orderId: payment.orderId,
        fromStatus: payment.status,
        toStatus: updatedPayment.status,
        method: updatedPayment.method,
        razorpayPaymentId: razorpayPaymentId || null,
        eventId: `PAYMENT_UPDATED:${payment.id}:${nextStatus}:${razorpayPaymentId || 'NO_RAZORPAY_PAYMENT'}`,
        actorId: 'razorpay_webhook',
        actorRole: 'SYSTEM'
      })

      if (nextStatus === 'SUCCESS') {
        await markOrderAsPlaced(payment.orderId, payment.order?.status, null)

        const currentOrder = await prisma.order.findUnique({
          where: { id: payment.orderId },
          select: { status: true, consumerId: true }
        })

        if (currentOrder && (currentOrder.status === 'PLACED' || currentOrder.status === 'PENDING')) {
          await clearCartOnSuccessfulPaymentIfUnchanged(
            payment.orderId,
            currentOrder.consumerId,
            'razorpay_webhook_success'
          )

          logger.info('[Payments] Payment captured via webhook', {
            orderId: payment.orderId,
            razorpayPaymentId
          })
        }
      } else if (nextStatus === 'FAILED') {
        await markOrderAsPaymentFailed(payment.orderId, payment.order?.status)
        logger.warn('[Payments] Payment failed via webhook', {
          orderId: payment.orderId,
          razorpayPaymentId
        })
      }
    }
  }

  // Handle refund events
  if (
    payload.event === 'refund.processed' ||
    payload.event === 'refund.failed'
  ) {
    const refundEntity = payload.payload.refund.entity
    const gatewayRefundId = refundEntity.id

    const refundTx = await prisma.refundTransaction.findFirst({
      where: {
        gatewayRefundId: gatewayRefundId
      }
    })

    if (refundTx) {
      const nextStatus = payload.event === 'refund.processed' ? 'SUCCEEDED' : 'FAILED'
      
      await prisma.refundTransaction.update({
        where: { id: refundTx.id },
        data: {
          status: nextStatus,
          finalizedAt: nextStatus === 'SUCCEEDED' ? new Date() : null
        }
      })

      if (nextStatus === 'SUCCEEDED' && refundTx.paymentId) {
        await prisma.payment.update({
          where: { id: refundTx.paymentId },
          data: {
            status: 'REFUNDED',
            razorpayRefundId: gatewayRefundId,
            refundedAt: new Date()
          }
        }).catch((err) => {
          logger.warn('[Payments] Could not update payment status to REFUNDED on webhook', {
            paymentId: refundTx.paymentId,
            error: err.message
          })
        })
      }

      logger.info('[Payments] Refund status updated via webhook', {
        refundId: refundTx.id,
        gatewayRefundId,
        nextStatus
      })
    }
  }

  // Always return 200 to acknowledge webhook
  if (webhookEventId) {
    await prisma.idempotencyRecord.upsert({
      where: { key_routeKey_userId: { key: String(webhookEventId), routeKey: 'razorpay-webhook-event', userId: 'service:razorpay-webhook' } },
      create: {
        key: String(webhookEventId),
        routeKey: 'razorpay-webhook-event',
        userId: 'service:razorpay-webhook',
        bodyHash: null,
        responseStatus: 200,
        responseBody: { received: true }
      },
      update: {
        responseStatus: 200,
        responseBody: { received: true }
      }
    }).catch(() => {})
  }
  return res.status(200).json({ received: true })
})

/**
 * POST /api/v1/payments/juspay/webhook
 * Handle Juspay webhook notifications
 */
export const juspayWebhook = asyncHandler(async (req, res) => {
  const signature =
    req.headers['x-juspay-signature'] ||
    req.headers['x-signature'] ||
    req.headers['signature']
  const webhookEventId =
    req.headers['x-juspay-event-id'] ||
    req.headers['x-event-id'] ||
    req.body?.event_id ||
    req.body?.id
  const payload = req.body || {}

  logger.info('[Payments] Juspay webhook received', {
    event: payload.event_name || payload.event || payload.status,
    webhookEventId: webhookEventId || null
  })

  // Durable replay handling for duplicate webhook deliveries
  if (webhookEventId) {
    const replay = await prisma.idempotencyRecord.findUnique({
      where: {
        key_routeKey_userId: {
          key: String(webhookEventId),
          routeKey: 'juspay-webhook-event',
          userId: 'service:juspay-webhook'
        }
      },
      select: { id: true }
    })
    if (replay) {
      logger.info('[Payments] JUSPAY_WEBHOOK_EVENT_REPLAY_IGNORED', {
        webhookEventId
      })
      return res.status(200).json({ received: true, replayIgnored: true })
    }
  }

  // Verify webhook signature if present or secret is configured
  if (signature) {
    const isValid = verifyJuspayWebhookSignature(payload, signature)
    if (!isValid) {
      logger.warn('[Payments] Invalid Juspay webhook signature')
      return errorResponse(res, 400, 'Invalid webhook signature')
    }
  }

  // Extract order identifier and status
  const orderNumber =
    payload.order_id ||
    payload.orderId ||
    payload.data?.order?.order_id ||
    payload.content?.order?.order_id
  const eventName = String(
    payload.event_name || payload.event || ''
  ).toUpperCase()
  const paymentStatus = String(
    payload.status ||
      payload.data?.order?.status ||
      payload.content?.order?.status ||
      ''
  ).toUpperCase()
  const txnId =
    payload.txn_id ||
    payload.payment_id ||
    payload.data?.order?.txn_id ||
    payload.content?.order?.txn_id ||
    null

  if (!orderNumber) {
    logger.warn('[Payments] Juspay webhook missing order_id', { payload })
    return res.status(200).json({ received: true, note: 'Missing order_id' })
  }

  // Find payment by Juspay order id or order number or order id
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { juspayOrderId: String(orderNumber) },
        { order: { orderNumber: String(orderNumber) } },
        { orderId: String(orderNumber) }
      ]
    },
    include: {
      order: true
    }
  })

  if (!payment) {
    logger.warn('[Payments] Payment not found for Juspay webhook order', {
      orderNumber
    })
    return res.status(200).json({ received: true, note: 'Order not found' })
  }

  const isSuccess =
    eventName === 'ORDER_SUCCEEDED' ||
    paymentStatus === 'CHARGED' ||
    eventName === 'CHARGED'
  const isFailed =
    eventName === 'ORDER_FAILED' ||
    eventName === 'AUTHENTICATION_FAILED' ||
    paymentStatus === 'FAILED' ||
    paymentStatus === 'AUTHORIZATION_FAILED'

  if (isSuccess) {
    const replayIgnored =
      payment.status === 'SUCCESS' &&
      (payment.juspayPaymentId || null) === (txnId || null)

    if (replayIgnored) {
      logger.info('[Payments] JUSPAY_WEBHOOK_REPLAY_IGNORED', {
        paymentId: payment.id,
        orderId: payment.orderId,
        txnId
      })
      return res.status(200).json({ received: true, replayIgnored: true })
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        gateway: 'JUSPAY',
        juspayPaymentId: txnId || payment.juspayPaymentId,
        juspayStatus: 'CHARGED'
      }
    })

    emitPaymentUpdatedEvent({
      paymentId: updatedPayment.id,
      orderId: payment.orderId,
      fromStatus: payment.status,
      toStatus: 'SUCCESS',
      method: updatedPayment.method,
      juspayPaymentId: txnId,
      eventId: `PAYMENT_UPDATED:${payment.id}:SUCCESS:${txnId || 'NO_TXN'}`,
      actorId: 'juspay_webhook',
      actorRole: 'SYSTEM'
    })

    await markOrderAsPlaced(payment.orderId, payment.order?.status, null)

    const currentOrder = await prisma.order.findUnique({
      where: { id: payment.orderId },
      select: { status: true, consumerId: true }
    })

    if (
      currentOrder &&
      (currentOrder.status === 'PLACED' || currentOrder.status === 'PENDING')
    ) {
      await clearCartOnSuccessfulPaymentIfUnchanged(
        payment.orderId,
        currentOrder.consumerId,
        'juspay_webhook_success'
      )
    }

    logger.info('[Payments] Juspay payment marked SUCCESS via webhook', {
      orderId: payment.orderId,
      txnId
    })
  } else if (isFailed) {
    if (payment.status !== 'SUCCESS') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          gateway: 'JUSPAY',
          juspayStatus: paymentStatus || eventName
        }
      })

      await markOrderAsPaymentFailed(
        payment.orderId,
        payment.order?.status,
        `Juspay webhook ${eventName || paymentStatus}`
      )

      logger.warn('[Payments] Juspay payment failed via webhook', {
        orderId: payment.orderId,
        txnId,
        eventName,
        paymentStatus
      })
    }
  }

  // Handle refund events
  if (
    eventName === 'REFUND_PROCESSED' ||
    eventName === 'REFUND_SUCCEEDED' ||
    payload.event === 'refund.processed'
  ) {
    const refundId =
      payload.refund_id ||
      payload.id ||
      payload.data?.refund?.id ||
      payload.content?.refund?.id

    if (refundId) {
      const refundTx = await prisma.refundTransaction.findFirst({
        where: {
          gatewayRefundId: refundId
        }
      })

      if (refundTx) {
        await prisma.refundTransaction.update({
          where: { id: refundTx.id },
          data: {
            status: 'SUCCEEDED',
            finalizedAt: new Date()
          }
        })

        if (refundTx.paymentId) {
          await prisma.payment
            .update({
              where: { id: refundTx.paymentId },
              data: {
                status: 'REFUNDED',
                juspayRefundId: refundId,
                refundedAt: new Date()
              }
            })
            .catch(() => {})
        }
      }
    }
  }

  // Acknowledge idempotency
  if (webhookEventId) {
    await prisma.idempotencyRecord
      .upsert({
        where: {
          key_routeKey_userId: {
            key: String(webhookEventId),
            routeKey: 'juspay-webhook-event',
            userId: 'service:juspay-webhook'
          }
        },
        create: {
          key: String(webhookEventId),
          routeKey: 'juspay-webhook-event',
          userId: 'service:juspay-webhook',
          bodyHash: null,
          responseStatus: 200,
          responseBody: { received: true }
        },
        update: {
          responseStatus: 200,
          responseBody: { received: true }
        }
      })
      .catch(() => {})
  }

  return res.status(200).json({ received: true })
})

/**
 * GET /api/v1/payments/:paymentId
 * Get payment status
 */
export const getPaymentStatus = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { paymentId } = req.params

  logger.info('[Payments] Fetching payment status', { userId, paymentId })

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: {
        select: {
          id: true,
          consumerId: true,
          status: true,
          orderNumber: true
        }
      }
    }
  })

  if (!payment) {
    return errorResponse(res, 404, 'Payment not found')
  }

  if (payment.order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  return successResponse(res, 200, {
    payment: formatPayment(payment),
    order: {
      id: payment.order.id,
      orderNumber: payment.order.orderNumber,
      status: payment.order.status
    }
  }, 'Payment status fetched successfully')
})

/**
 * POST /api/v1/payments/:paymentId/retry
 * Retry failed payment
 */
export const retryPayment = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { paymentId } = req.params

  logger.info('[Payments] Retrying payment', { userId, paymentId })

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: {
        include: {
          consumer: true
        }
      }
    }
  })

  if (!payment) {
    return errorResponse(res, 404, 'Payment not found')
  }

  if (payment.order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  if (payment.status !== 'FAILED') {
    return errorResponse(res, 400, 'Payment is not in failed state')
  }

  // For Razorpay, create a new order
  if (payment.method.startsWith('RAZORPAY_')) {
    try {
      const razorpayOrder = await createRazorpayOrder(
        payment.amount,
        'INR',
        payment.order.orderNumber
      )

      const updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'PENDING',
          razorpayOrderId: razorpayOrder.id,
          razorpayPaymentId: null,
          razorpaySignature: null
        }
      })
      emitPaymentUpdatedEvent({
        paymentId: updatedPayment.id,
        orderId: payment.order.id,
        fromStatus: payment.status,
        toStatus: updatedPayment.status,
        razorpayPaymentId: updatedPayment.razorpayPaymentId || null,
        method: updatedPayment.method,
        actorId: userId,
        actorRole: req.user?.role || null
      })

      logger.info('[Payments] Payment retry initiated', {
        userId,
        paymentId,
        razorpayOrderId: razorpayOrder.id
      })

      return successResponse(res, 200, {
        payment: formatPayment(updatedPayment),
        razorpay: {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount / 100,
          currency: razorpayOrder.currency,
          key: process.env.RAZORPAY_KEY_ID
        }
      }, 'Payment retry initiated successfully')
    } catch (error) {
      logger.error('[Payments] Error retrying payment', {
        error: error.message,
        paymentId
      })
      return errorResponse(res, 500, 'Failed to retry payment. Please try again.')
    }
  }

  // For Juspay, create a new session
  if (payment.method.startsWith('JUSPAY')) {
    try {
      const session = await createJuspaySession({
        orderId: payment.order.orderNumber,
        amount: payment.amount,
        customerId: payment.order.consumerId || userId,
        customerEmail: payment.order.consumer?.email || req.user?.email,
        customerPhone: payment.order.consumer?.phone || req.user?.phone,
        returnUrl: `${process.env.FRONTEND_URL || 'https://villagkart.com'}/orders/${payment.order.id}/payment-status`
      })

      const updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'PENDING',
          gateway: 'JUSPAY',
          juspayOrderId: session.order_id || payment.order.orderNumber,
          juspayStatus: session.status || 'NEW',
          juspayPaymentId: null,
          juspaySignature: null
        }
      })

      emitPaymentUpdatedEvent({
        paymentId: updatedPayment.id,
        orderId: payment.order.id,
        fromStatus: payment.status,
        toStatus: updatedPayment.status,
        method: updatedPayment.method,
        juspayPaymentId: null,
        actorId: userId,
        actorRole: req.user?.role || null
      })

      logger.info('[Payments] Juspay payment retry initiated', {
        userId,
        paymentId,
        juspayOrderId: session.order_id || payment.order.orderNumber
      })

      return successResponse(
        res,
        200,
        {
          payment: formatPayment(updatedPayment),
          juspay: {
            orderId: session.order_id || payment.order.orderNumber,
            status: session.status || 'NEW',
            sdkPayload: session.sdk_payload || {},
            paymentLinks: session.payment_links || {}
          }
        },
        'Payment retry initiated successfully (Juspay)'
      )
    } catch (error) {
      logger.error('[Payments] Error retrying Juspay payment', {
        error: error.message,
        paymentId
      })
      return errorResponse(
        res,
        500,
        'Failed to retry payment with Juspay. Please try again.'
      )
    }
  }

  return errorResponse(res, 400, 'Payment method does not support retry')
})

/**
 * Get all saved payment methods of user
 * GET /api/v1/payments/saved
 */
export const getSavedPaymentMethods = asyncHandler(async (req, res) => {
  const userId = req.user.id

  try {
    const savedMethods = await prisma.savedPaymentMethod.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' }
    })

    return successResponse(res, 200, savedMethods, 'Saved payment methods retrieved successfully')
  } catch (error) {
    logger.error('[Payments] Error retrieving saved payment methods', {
      error: error.message,
      userId
    })
    return errorResponse(res, 500, 'Failed to retrieve saved payment methods')
  }
})

/**
 * Add a saved payment method
 * POST /api/v1/payments/saved
 */
export const addSavedPaymentMethod = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const {
    methodType,
    provider,
    maskedNumber,
    expiryMonth,
    expiryYear,
    cardholderName,
    upiId,
    gatewayToken,
    isDefault
  } = req.body

  try {
    const defaultFlag = isDefault === true || isDefault === 'true'

    // If setting as default, unset other default payment methods in a transaction
    if (defaultFlag) {
      await prisma.savedPaymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false }
      })
    }

    const savedMethod = await prisma.savedPaymentMethod.create({
      data: {
        userId,
        methodType,
        provider: provider || null,
        maskedNumber: maskedNumber || null,
        expiryMonth: expiryMonth || null,
        expiryYear: expiryYear || null,
        cardholderName: cardholderName || null,
        upiId: upiId || null,
        gatewayToken: gatewayToken || null,
        isDefault: defaultFlag
      }
    })

    return successResponse(res, 201, savedMethod, 'Payment method saved successfully')
  } catch (error) {
    logger.error('[Payments] Error saving payment method', {
      error: error.message,
      userId
    })
    return errorResponse(res, 500, 'Failed to save payment method')
  }
})

/**
 * Delete a saved payment method
 * DELETE /api/v1/payments/saved/:id
 */
export const deleteSavedPaymentMethod = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { id } = req.params

  try {
    const savedMethod = await prisma.savedPaymentMethod.findUnique({
      where: { id }
    })

    if (!savedMethod) {
      return errorResponse(res, 404, 'Saved payment method not found')
    }

    if (savedMethod.userId !== userId) {
      return errorResponse(res, 403, 'Access denied to this payment method')
    }

    await prisma.savedPaymentMethod.delete({
      where: { id }
    })

    return successResponse(res, 200, null, 'Saved payment method deleted successfully')
  } catch (error) {
    logger.error('[Payments] Error deleting saved payment method', {
      error: error.message,
      id,
      userId
    })
    return errorResponse(res, 500, 'Failed to delete saved payment method')
  }
})

/**
 * Set a saved payment method as default
 * PATCH /api/v1/payments/saved/:id/default
 */
export const setDefaultSavedPaymentMethod = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { id } = req.params

  try {
    const savedMethod = await prisma.savedPaymentMethod.findUnique({
      where: { id }
    })

    if (!savedMethod) {
      return errorResponse(res, 404, 'Saved payment method not found')
    }

    if (savedMethod.userId !== userId) {
      return errorResponse(res, 403, 'Access denied to this payment method')
    }

    // Set all other default payment methods of this user to false, and this one to true
    await prisma.$transaction([
      prisma.savedPaymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false }
      }),
      prisma.savedPaymentMethod.update({
        where: { id },
        data: { isDefault: true }
      })
    ])

    return successResponse(res, 200, null, 'Payment method set as default successfully')
  } catch (error) {
    logger.error('[Payments] Error setting default payment method', {
      error: error.message,
      id,
      userId
    })
    return errorResponse(res, 500, 'Failed to update default payment method')
  }
})

