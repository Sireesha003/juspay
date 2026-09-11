import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { releaseReservation } from '../services/reservationService.js'
import {
  calculateDeliveryCharge,
  validateWarehouseConsistency,
  validateStockAvailability
} from '../utils/orderUtils.js'
import { createOrder as createOrderService } from '../services/orderCreationService.js'
import { sendOrderNotification } from '../utils/notificationService.js'
import { orchestrateOnlineRefund } from '../services/refundOrchestrationService.js'
import {
  calculateTaxAfterDiscount,
  getStateCode,
  calculateGST
} from '../utils/taxUtils.js'
import {
  canCancelOrder,
  CANCELLABLE_ORDER_STATUSES,
  PRISMA_CANCELLABLE_STATUSES
} from '../utils/orderStatusUtils.js'
import { saveFailedCreateOrderMirror } from '../services/createOrderDeliveryMirrorRetryService.js'
import { validateOrderLifecycleTransition } from '../services/orderLifecycleService.js'
import {
  releaseDeliverySlotWithTx,
  releaseDeliverySlotWithTxRetry,
  releaseDeliverySlotByIdWithTx,
  bookDeliverySlotWithTx
} from '../utils/deliverySlotUtils.js'
import { releasePickupSlot } from '../services/pickupSlotService.js'
import { orchestratePostLocationPersist } from '../services/orchestration/orderLifecycleOrchestrator.js'
import { calculateETA, formatETA } from '../utils/etaUtils.js'
import {
  mapProductUnitToStandardUnits,
  getOrderItemUnit
} from '../utils/unitUtils.js'
import { DEFAULT_GST_RATE } from '../utils/taxUtils.js'
import { normalizeWarehouseId } from '../utils/cartWarehouseUtils.js'
import { validateAndSanitizeCart } from '../utils/cartSanitization.js'
import { emitCanonicalEvent } from '../audit/auditLogger.js'
import { CANONICAL_EVENTS } from '../audit/auditConstants.js'
import { cancelOrderOnPaymentFailure } from './paymentsController.js'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const DELIVERY_API_BASE_URL = (
  process.env.DELIVERY_API_BASE_URL || 'http://localhost:3005/api/v1'
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

/** User-friendly labels for order status (for customer app display) */
const ORDER_STATUS_LABELS = {
  PLACED: 'Your order has been placed successfully',
  PENDING: 'Your order is awaiting payment confirmation',
  PAYMENT_FAILED: 'Payment failed for this order. Please retry or choose another payment method',
  CONFIRMED: 'Your order has been confirmed',
  ACCEPTED: 'Your order has been accepted and is being prepared',
  PICKING: 'Your items are being picked',
  PACKING: 'Your items are being packed',
  PROCESSING: 'Your order is being prepared',
  READY_FOR_PICKUP: 'Your order is ready for pickup',
  ASSIGNED_TO_AGENT: 'A delivery agent has been assigned to your order',
  OUT_FOR_DELIVERY: 'Your order is out for delivery',
  RETURN_INITIATED: 'A return has been initiated for your order',
  PICKED_UP: 'Your order has been picked up by the delivery agent',
  IN_TRANSIT: 'Your order is on the way',
  DELIVERED: 'Your order has been delivered successfully',
  CANCELLED: 'Your order has been cancelled',
  FAILED: 'Your order could not be processed',
  RETURNED: 'Your order has been returned'
}

const DELIVERY_WITH_AGENT_INCLUDE = {
  include: {
    agent: {
      select: { id: true, name: true, phone: true }
    }
  }
}

/**
 * Cleanup stale unpaid pending orders for a user
 */
async function cleanupStalePendingOrders(userId) {
  if (!userId) return
  try {
    const staleOrders = await prisma.order.findMany({
      where: {
        consumerId: userId,
        status: 'PENDING',
        payment: {
          is: {
            status: { in: ['PENDING', 'FAILED', 'INITIATED'] },
            method: { not: 'COD' }
          }
        }
      },
      select: { id: true, status: true }
    })

    for (const stale of staleOrders) {
      await cancelOrderOnPaymentFailure(stale.id, userId, 'Payment cancelled / failed by user')
    }
  } catch (err) {
    logger.warn('[Orders] Cleanup stale pending orders failed', { userId, error: err.message })
  }
}

export function resolveCustomerOrderStage(order) {
  const status = (order?.status || '').toUpperCase()
  const deliveryStatus = (order?.delivery?.status || '').toUpperCase()
  const agentId = order?.delivery?.agentId || order?.agentId

  if (status === 'CANCELLED') {
    return { stage: 0, stageName: 'CANCELLED', consumerStatus: 'Order Cancelled', label: 'Order Cancelled', status: 'CANCELLED' }
  }
  if (status === 'PAYMENT_FAILED') {
    return { stage: 0, stageName: 'PAYMENT_FAILED', consumerStatus: 'Payment Failed', label: 'Payment failed for this order. Please retry or choose another payment method.', status: 'PAYMENT_FAILED' }
  }
  if (status === 'FAILED') {
    return { stage: 0, stageName: 'FAILED', consumerStatus: 'Order Failed', label: 'Your order could not be processed', status: 'FAILED' }
  }
  if (status === 'PENDING') {
    return { stage: 0, stageName: 'PENDING', consumerStatus: 'Payment Pending', label: 'Payment pending. Order not placed', status: 'PENDING' }
  }
  if (status === 'DELIVERED' || deliveryStatus === 'DELIVERED') {
    return { stage: 10, stageName: 'DELIVERED', consumerStatus: 'Delivered', label: 'Order successfully delivered', status: 'DELIVERED' }
  }
  if (status === 'ARRIVING_SOON' || deliveryStatus === 'ARRIVING_SOON') {
    return { stage: 9, stageName: 'ARRIVING_SOON', consumerStatus: 'Arriving Soon', label: 'Rider is nearby (ETA 2–5 minutes)', status: 'ARRIVING_SOON' }
  }
  if (status === 'OUT_FOR_DELIVERY' || status === 'IN_TRANSIT' || status === 'PICKED_UP' || deliveryStatus === 'OUT_FOR_DELIVERY' || deliveryStatus === 'IN_TRANSIT') {
    return { stage: 8, stageName: 'OUT_FOR_DELIVERY', consumerStatus: 'Out for Delivery', label: 'Rider has started the delivery', status: 'OUT_FOR_DELIVERY' }
  }
  if (agentId || deliveryStatus === 'ASSIGNED' || deliveryStatus === 'ASSIGNED_TO_AGENT' || status === 'ASSIGNED_TO_AGENT' || status === 'DELIVERY_PARTNER_ASSIGNED') {
    return { stage: 7, stageName: 'DELIVERY_PARTNER_ASSIGNED', consumerStatus: 'Delivery Partner Assigned', label: 'Rider has accepted the delivery', status: 'DELIVERY_PARTNER_ASSIGNED' }
  }
  if (status === 'READY_FOR_PICKUP' || status === 'PACKED' || status === 'READY_FOR_DISPATCH') {
    return { stage: 6, stageName: 'READY_FOR_DISPATCH', consumerStatus: 'Ready for Dispatch', label: 'Package is ready and waiting for rider', status: 'READY_FOR_DISPATCH' }
  }
  if (status === 'PACKING' || status === 'PACKING_ORDER' || (status === 'PROCESSING' && (order?.packingStartedAt || order?.pickingCompletedAt))) {
    return { stage: 5, stageName: 'PACKING_ORDER', consumerStatus: 'Packing Order', label: 'Items are being packed', status: 'PACKING_ORDER' }
  }
  if (status === 'PICKING' || status === 'PICKING_ITEMS' || (status === 'PROCESSING' && order?.pickingStartedAt)) {
    return { stage: 4, stageName: 'PICKING_ITEMS', consumerStatus: 'Picking Items', label: 'Store executive is collecting items', status: 'PICKING_ITEMS' }
  }
  if (status === 'ACCEPTED' || (status === 'PROCESSING' && (order?.acceptedByShopkeeperAt || order?.shopkeeperAcceptedAt))) {
    return { stage: 3, stageName: 'ORDER_ACCEPTED', consumerStatus: 'Order Accepted', label: 'Order accepted', status: 'ORDER_ACCEPTED' }
  }
  if (status === 'CONFIRMED' || status === 'PROCESSING' || order?.confirmedAt) {
    return { stage: 2, stageName: 'ORDER_CONFIRMED', consumerStatus: 'Order Confirmed', label: 'Order confirmed', status: 'ORDER_CONFIRMED' }
  }
  return { stage: 1, stageName: 'ORDER_PLACED', consumerStatus: 'Order Placed', label: 'Order placed successfully', status: 'ORDER_PLACED' }
}

/**
 * Compute payment, debited amount, refund, and bill details for customer response
 */
export function computeOrderFinancialDetails(order) {
  const payment = order?.payment
  const paymentStatus = (payment?.status || '').toUpperCase()
  const paymentMethod = payment?.method || null
  const orderStatus = (order?.status || '').toUpperCase()
  const isCod = paymentMethod === 'COD'

  // An order is paid if online payment succeeded/refunded or COD cash was collected.
  // FAILED, PENDING, INITIATED, CANCELLED online payments mean no money was debited from user.
  const isPaidOnline =
    !isCod &&
    ['SUCCESS', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_PENDING'].includes(paymentStatus)
  const isPaidCod = isCod && (payment?.codCollected === true || paymentStatus === 'SUCCESS')
  const isPaid = Boolean(isPaidOnline || isPaidCod)

  const rawAmountPaid =
    payment?.amount != null
      ? Number(payment.amount)
      : Number(order?.totalAmount || 0)
  const amountPaid = isPaid ? rawAmountPaid : 0
  const amountDebited = amountPaid

  // Refund transactions
  const refundTxs = order?.refundTransactions || payment?.refundTransactions || []
  const successfulRefunds = Array.isArray(refundTxs)
    ? refundTxs.filter(
        (tx) =>
          (tx?.status || '').toUpperCase() === 'SUCCEEDED' ||
          (tx?.status || '').toUpperCase() === 'COMPLETED'
      )
    : []
  const totalTxRefundAmount = successfulRefunds.reduce(
    (sum, tx) => sum + Number(tx.amount || 0),
    0
  )

  let refundStatus = 'NOT_APPLICABLE'
  let refundAmount = 0
  let isRefundable = false

  if (
    orderStatus === 'CANCELLED' ||
    paymentStatus === 'REFUNDED' ||
    paymentStatus === 'PARTIALLY_REFUNDED' ||
    paymentStatus === 'REFUND_PENDING'
  ) {
    if (isPaid) {
      isRefundable = true
      if (paymentStatus === 'REFUNDED') {
        refundStatus = 'REFUNDED'
        refundAmount = totalTxRefundAmount > 0 ? totalTxRefundAmount : amountPaid
      } else if (paymentStatus === 'PARTIALLY_REFUNDED') {
        refundStatus = 'PARTIALLY_REFUNDED'
        refundAmount = totalTxRefundAmount > 0 ? totalTxRefundAmount : amountPaid
      } else if (paymentStatus === 'REFUND_PENDING') {
        refundStatus = 'REFUND_PENDING'
        refundAmount = totalTxRefundAmount > 0 ? totalTxRefundAmount : amountPaid
      } else {
        refundStatus = 'REFUND_INITIATED'
        refundAmount = amountPaid
      }
    } else {
      refundStatus = 'NOT_APPLICABLE'
      refundAmount = 0
      isRefundable = false
    }
  }

  // To Pay / Amount Due:
  // If order is cancelled or already paid, remaining to pay is 0.
  let toPay = 0
  if (orderStatus !== 'CANCELLED' && !isPaid) {
    toPay = Number(order?.totalAmount || 0)
  }
  const amountDue = toPay

  // Meaningful refund & payment status messages for client UI
  let refundMessage = null
  if (orderStatus === 'CANCELLED') {
    if (!isPaid) {
      refundMessage = 'No amount was debited from your account. No refund required.'
    } else if (refundStatus === 'REFUNDED') {
      refundMessage = `Refund of ₹${refundAmount.toFixed(2)} has been successfully processed to your ${paymentMethod || 'original payment'} account.`
    } else {
      refundMessage = `Refund of ₹${refundAmount.toFixed(2)} is being processed to your original payment method.`
    }
  }

  const latestRefundTx =
    successfulRefunds[successfulRefunds.length - 1] ||
    (Array.isArray(refundTxs) && refundTxs.length > 0
      ? refundTxs[refundTxs.length - 1]
      : null)
  const gatewayRefundId =
    payment?.razorpayRefundId || latestRefundTx?.gatewayRefundId || null
  const refundedAt =
    payment?.refundedAt ||
    latestRefundTx?.finalizedAt ||
    latestRefundTx?.createdAt ||
    null

  const itemsTotal = (order?.items || []).reduce(
    (sum, item) => sum + Number(item.totalPrice || 0),
    0
  )

  return {
    isPaid,
    amountPaid,
    amountDebited,
    toPay,
    amountDue,
    refundStatus,
    refundAmount,
    isRefundable,
    refundDetails: {
      isEligible: isRefundable,
      status: refundStatus,
      amount: refundAmount,
      amountDebited,
      amountPaid,
      refundedAt,
      gatewayRefundId,
      paymentMethod,
      message: refundMessage
    },
    billDetails: {
      itemsTotal:
        itemsTotal > 0 ? itemsTotal : Number(order?.totalAmount || 0),
      deliveryCharge: Number(order?.deliveryCharge || 0),
      discount: Number(order?.discount || 0),
      couponDiscount: Number(order?.couponDiscount || 0),
      taxAmount: Number(order?.taxAmount || 0),
      grandTotal: Number(order?.totalAmount || 0),
      amountPaid,
      amountDebited,
      toPay,
      amountDue,
      refundAmount,
      refundStatus,
      paymentStatus: paymentStatus || 'PENDING',
      paymentMethod
    }
  }
}

/**
 * Format order for response
 */
export function formatOrder(order) {
  const stageInfo = resolveCustomerOrderStage(order)
  const fin = computeOrderFinancialDetails(order)
  const now = new Date()
  const deliveryDate = order.deliveryDate ? new Date(order.deliveryDate) : null
  const isScheduled = deliveryDate && deliveryDate > now
  const resolvedDeliveryAgent =
    order.delivery?.agent ?? order.agent ?? order.deliveryAssignment?.agent ?? null
  const resolvedAssignedAt =
    order.delivery?.assignedAt ??
    order.assignedAt ??
    order.deliveryAssignment?.createdAt ??
    null
  const resolvedPickedUpAt = order.delivery?.pickedUpAt ?? order.pickedUpAt ?? null
  const resolvedDeliveredAt = order.delivery?.deliveredAt ?? order.deliveredAt ?? null

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: stageInfo.status || order.status,
    rawStatus: order.status,
    currentStatus: stageInfo.status,
    consumerStatus: stageInfo.consumerStatus,
    currentStage: stageInfo.stage,
    stageName: stageInfo.stageName,
    orderStatusLabel: stageInfo.label,
    canCancel: canCancelOrder(order.status),
    cancellationDisabledMessage: canCancelOrder(order.status)
      ? null
      : 'Cancellation is disabled at this stage. Please contact customer care.',
    totalAmount: order.totalAmount,
    deliveryCharge: order.deliveryCharge,
    discount: order.discount,
    taxAmount: order.taxAmount || 0,
    cgst: order.cgst || 0,
    sgst: order.sgst || 0,
    igst: order.igst || 0,
    taxableAmount: order.taxableAmount || 0,
    deliverySlot: order.deliverySlot,
    deliveryDate: order.deliveryDate,
    isScheduled,
    specialInstructions: order.specialInstructions,
    couponCode: order.couponCode,
    couponDiscount: order.couponDiscount,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    confirmedAt: order.confirmedAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
    isPaid: fin.isPaid,
    amountPaid: fin.amountPaid,
    amountDebited: fin.amountDebited,
    toPay: fin.toPay,
    amountDue: fin.amountDue,
    refundAmount: fin.refundAmount,
    refundStatus: fin.refundStatus,
    isRefundable: fin.isRefundable,
    refundDetails: fin.refundDetails,
    billDetails: fin.billDetails,
    address: order.address
      ? {
          id: order.address.id,
          label: order.address.label || '',
          line1: order.address.line1 || '',
          line2: order.address.line2 || '',
          city: order.address.city || '',
          state: order.address.state || '',
          pincode: order.address.pincode || '',
          location: order.address.location,
          isDefault: order.address.isDefault
        }
      : null,
    items: order.items
      ? order.items.map((item) => ({
          id: item.id,
          product: item.product
            ? {
                id: item.product.id,
                name: item.productName || item.product.name,
                images: item.productImage
                  ? [item.productImage]
                  : item.product.images || [],
                unit: getOrderItemUnit(item, item.product) // Use OrderItem.unit with fallback
              }
            : {
                id: null,
                name: item.productName || 'Product not found',
                images: item.productImage ? [item.productImage] : [],
                unit: item.unit || 'PIECE' // Use OrderItem.unit if available
              },
          quantity: item.quantity,
          unit: getOrderItemUnit(item, item.product), // Include unit at item level
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          mrp: item.mrp,
          discount: item.discount || 0,
          taxAmount: item.taxAmount || 0,
          hsnCode: item.hsnCode
        }))
      : [],
    payment: order.payment
      ? {
          id: order.payment.id,
          method: order.payment.method,
          amount: order.payment.amount,
          status: order.payment.status,
          razorpayOrderId: order.payment.razorpayOrderId ?? null,
          razorpayPaymentId: order.payment.razorpayPaymentId ?? null,
          razorpayRefundId: order.payment.razorpayRefundId ?? null,
          refundedAt: order.payment.refundedAt ?? null,
          isPaid: fin.isPaid,
          amountPaid: fin.amountPaid,
          amountDebited: fin.amountDebited,
          refundAmount: fin.refundAmount,
          refundStatus: fin.refundStatus
        }
      : null,
    delivery: order.delivery
      ? {
          id: order.delivery.id,
          status: order.delivery.status,
          name: resolvedDeliveryAgent?.name ?? null,
          phone: resolvedDeliveryAgent?.phone ?? null,
          assignedAt: resolvedAssignedAt,
          pickedUpAt: resolvedPickedUpAt,
          deliveredAt: resolvedDeliveredAt
        }
      : null,
    deliveryType: order.deliveryType ?? null,
    pickupStoreId: order.pickupStoreId ?? null,
    pickupTimeSlot: order.pickupTimeSlot ?? null,
    pickupStore: order.pickupStore
      ? {
          id: order.pickupStore.id,
          name: order.pickupStore.name,
          address: order.pickupStore.address ?? null
        }
      : null,
    statusHistory: order.statusHistory
      ? order.statusHistory.map((history) => ({
          id: history.id,
          fromStatus: history.fromStatus,
          toStatus: history.toStatus,
          changedBy: history.changedBy === 'SYSTEM_AUTO_CONFIRM' ? 'SYSTEM' : history.changedBy,
          reason: history.reason
            ? history.reason.replace(/auto-confirmed after 30 seconds/gi, 'Confirmed').replace(/auto-confirmation/gi, 'Confirmation')
            : history.toStatus === 'CONFIRMED' ? 'Confirmed' : history.reason,
          notes: history.notes
            ? history.notes.replace(/auto-confirmed after 30 seconds/gi, 'Confirmed').replace(/auto-confirmation/gi, 'Confirmation')
            : history.notes,
          createdAt: history.createdAt
        }))
      : []
  }
}

/**
 * POST /api/v1/orders
 * Create order from cart. Uses shared order creation service.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const payload = {
    warehouseId: req.body.warehouseId,
    deliveryType: req.body.deliveryType,
    addressId: req.body.addressId,
    deliverySlot: req.body.deliverySlot,
    deliveryDate: req.body.deliveryDate,
    routeMapId: req.body.routeMapId,
    pickupTimeSlot: req.body.pickupTimeSlot,
    pickupSlotId: req.body.pickupSlotId,
    specialInstructions: req.body.specialInstructions,
    couponCode: req.body.couponCode,
    orderStatus: req.body.orderStatus
  }

  logger.info('[Orders] Creating order', {
    userId,
    warehouseId: payload.warehouseId,
    addressId: payload.addressId,
    couponCode: payload.couponCode,
    deliveryType: payload.deliveryType,
    orderStatus: payload.orderStatus
  })

  let orderId
  let reusedExistingOrder = false
  let shouldClearCart = false
  try {
    const result = await createOrderService(userId, payload)
    orderId = result.orderId
    reusedExistingOrder = result.reusedExistingOrder === true
    shouldClearCart = result.shouldClearCart !== false
  } catch (err) {
    const message = err.message || 'Order creation failed'
    const data = err.stockIssues ? { stockIssues: err.stockIssues } : undefined
    return errorResponse(res, 400, message, data)
  }

  if (!reusedExistingOrder) {
    try {
      const { createOrderStatusHistory } = await import(
        '../utils/orderStatusHistory.js'
      )
      await createOrderStatusHistory(
        orderId,
        null,
        'PENDING',
        userId,
        'Order created',
        null
      )
    } catch (error) {
      logger.error('[Orders] Error creating initial status history', {
        error: error.message,
        orderId
      })
    }
  }

  const completeOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      address: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              images: true,
              unit: true
            }
          }
        }
      },
      payment: true,
      delivery: DELIVERY_WITH_AGENT_INCLUDE,
      pickupStore: { select: { id: true, name: true, address: true } },
      statusHistory: true
    }
  })

  logger.info('[Orders] Order created successfully', {
    userId,
    orderId,
    orderNumber: completeOrder?.orderNumber,
    totalAmount: completeOrder?.totalAmount
  })

  if (!reusedExistingOrder && completeOrder?.id) {
    void emitCanonicalEvent({
      eventName: CANONICAL_EVENTS.orderCreated,
      entityType: 'ORDER',
      entityId: completeOrder.id,
      action: 'CREATED',
      payload: {
        orderNumber: completeOrder.orderNumber,
        consumerId: completeOrder.consumerId,
        status: completeOrder.status,
        totalAmount: completeOrder.totalAmount,
        actorId: userId,
        actorRole: req.user?.role || null
      },
      afterJson: {
        id: completeOrder.id,
        status: completeOrder.status,
        totalAmount: completeOrder.totalAmount
      }
    }).catch(() => {})
  }

  if (!reusedExistingOrder && completeOrder?.status === 'PLACED') {
    try {
      await callDeliveryApi({
        path: '/order/create-order',
        method: 'POST',
        useSyncKey: true,
        body: {
          orderId: completeOrder.id,
          orderNumber: completeOrder.orderNumber,
          consumerId: completeOrder.consumerId,
          addressId: completeOrder.addressId,
          warehouseId: completeOrder.warehouseId,
          totalAmount: Number(completeOrder.totalAmount || 0),
          deliveryDate: completeOrder.deliveryDate,
          specialInstructions: completeOrder.specialInstructions,
          orderItems: (completeOrder.items || []).map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: Number(item.unitPrice || 0),
            totalPrice: Number(item.totalPrice || 0)
          }))
        }
      })
    } catch (syncError) {
      logger.error('[Orders] Delivery API create-order sync failed', {
        orderId,
        error: syncError.message
      })
      await saveFailedCreateOrderMirror({
        orderId: completeOrder.id,
        body: {
          orderId: completeOrder.id,
          orderNumber: completeOrder.orderNumber,
          consumerId: completeOrder.consumerId,
          addressId: completeOrder.addressId,
          warehouseId: completeOrder.warehouseId,
          totalAmount: Number(completeOrder.totalAmount || 0),
          deliveryDate: completeOrder.deliveryDate,
          specialInstructions: completeOrder.specialInstructions,
          orderItems: (completeOrder.items || []).map((item) => ({
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
  }

  if (!reusedExistingOrder && completeOrder?.status === 'PLACED') {
    try {
      const { queueOrderStatusChange } = await import(
        '../jobs/orderStatusProcessor.js'
      )
      await queueOrderStatusChange(orderId, 'PENDING', 'PLACED', userId)
    } catch (error) {
      logger.error('[Orders] Error queueing order status change job', {
        error: error.message,
        orderId
      })
      try {
        await sendOrderNotification(userId, completeOrder, 'PLACED')
      } catch (notifError) {
        logger.error('[Orders] Error sending order notification', {
          error: notifError.message,
          orderId
        })
      }
    }
  }

  return successResponse(
    res,
    reusedExistingOrder ? 200 : 201,
    {
      order: formatOrder(completeOrder),
      checkout: {
        reusedExistingOrder,
        shouldClearCart
      }
    },
    reusedExistingOrder
      ? 'Existing pending order reused successfully'
      : 'Order created successfully'
  )
})

/**
 * GET /api/v1/orders
 * Get user's orders
 */
export const getOrders = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const {
    status,
    page = 1,
    limit: limitParam,
    startDate,
    endDate,
    scheduled
  } = req.query

  await cleanupStalePendingOrders(userId)

  // Validate and constrain pagination parameters
  const pageNum = Math.max(1, parseInt(page) || 1)
  const limitNum = Math.min(
    Math.max(1, parseInt(limitParam) || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  )

  logger.info('[Orders] Fetching orders', {
    userId,
    status,
    page: pageNum,
    limit: limitNum,
    scheduled
  })

  const where = {
    consumerId: userId
  }

  // Filter by status if provided
  if (status) {
    where.status = status
  }

  // Filter for scheduled orders (orders with future delivery date)
  if (scheduled === 'true') {
    const now = new Date()
    where.deliveryDate = {
      gte: now
    }
  }

  // Filter by date range if provided
  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) {
      where.createdAt.gte = new Date(startDate)
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate)
    }
  }

  // Get total count for pagination
  const total = await prisma.order.count({ where })

  // Calculate skip for pagination
  const skip = (pageNum - 1) * limitNum

  // Fetch orders with pagination
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip,
    take: limitNum,
    include: {
      address: {
        select: {
          id: true,
          label: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          pincode: true
        }
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              images: true,
              unit: true
            }
          }
        }
      },
      payment: {
        select: {
          id: true,
          method: true,
          amount: true,
          status: true,
          razorpayOrderId: true,
          razorpayPaymentId: true,
          razorpayRefundId: true,
          refundedAt: true,
          codCollected: true,
          refundTransactions: {
            select: {
              id: true,
              amount: true,
              status: true,
              gatewayRefundId: true,
              createdAt: true,
              finalizedAt: true
            }
          }
        }
      },
      refundTransactions: {
        select: {
          id: true,
          amount: true,
          status: true,
          gatewayRefundId: true,
          createdAt: true,
          finalizedAt: true
        }
      },
      delivery: {
        select: {
          id: true,
          status: true,
          assignedAt: true,
          pickedUpAt: true,
          deliveredAt: true,
          agent: {
            select: { id: true, name: true, phone: true }
          }
        }
      },
      pickupStore: {
        select: {
          id: true,
          name: true,
          address: true
        }
      }
    }
  })

  // Format orders and add isScheduled field
  const formattedOrders = orders.map((order) => {
    const formatted = formatOrder(order)
    const now = new Date()
    const deliveryDate = order.deliveryDate
      ? new Date(order.deliveryDate)
      : null
    formatted.isScheduled = deliveryDate && deliveryDate > now
    return formatted
  })

  const totalPages = Math.ceil(total / limitNum)

  return successResponse(
    res,
    200,
    {
      orders: formattedOrders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    },
    'Orders fetched successfully'
  )
})

/**
 * GET /api/v1/orders/:orderId
 * Get order details
 */
export const getOrderById = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params

  await cleanupStalePendingOrders(userId)

  logger.info('[Orders] Fetching order details', { userId, orderId })

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      address: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              images: true,
              unit: true,
              brand: {
                select: {
                  id: true,
                  name: true,
                  image: true
                }
              },
              category: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      },
      payment: {
        include: {
          refundTransactions: true
        }
      },
      refundTransactions: true,
      delivery: {
        include: {
          agent: {
            select: { id: true, name: true, phone: true }
          }
        }
      },
      agent: {
        select: { id: true, name: true, phone: true }
      },
      deliveryAssignment: {
        select: {
          createdAt: true,
          agent: {
            select: { id: true, name: true, phone: true }
          }
        }
      },
      pickupStore: {
        select: {
          id: true,
          name: true,
          address: true
        }
      },
      statusHistory: {
        orderBy: { createdAt: 'asc' }
      }
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  return successResponse(
    res,
    200,
    { order: formatOrder(order) },
    'Order details fetched successfully'
  )
})

/**
 * Calculate cancellation fee based on order status and time
 */
function calculateCancellationFee(order, cancellationTime) {
  const orderCreatedAt = new Date(order.createdAt)
  const timeSinceOrder = (cancellationTime - orderCreatedAt) / (1000 * 60) // minutes

  // Free cancellation within 30 minutes
  if (timeSinceOrder <= 30) {
    return 0
  }

  // 5% fee if cancelled after 30 minutes but before processing starts
  if (['PLACED', 'PENDING', 'CONFIRMED'].includes(order.status)) {
    return Math.round(order.totalAmount * 0.05 * 100) / 100
  }

  // 10% fee if cancelled after processing starts
  if (['PROCESSING', 'READY_FOR_PICKUP'].includes(order.status)) {
    return Math.round(order.totalAmount * 0.1 * 100) / 100
  }

  if (order.status === 'OUT_FOR_DELIVERY') {
    const lateDeliveryStatuses = [
      'PICKED_UP',
      'IN_TRANSIT',
      'DELIVERY_OTP_PENDING',
      'DELIVERED'
    ]
    if (order.delivery?.status && lateDeliveryStatuses.includes(order.delivery.status)) {
      return order.totalAmount
    }
    return Math.round(order.totalAmount * 0.1 * 100) / 100
  }

  if (['PICKED_UP', 'IN_TRANSIT'].includes(order.status)) {
    return order.totalAmount
  }

  return 0
}

/**
 * PATCH /api/v1/orders/:orderId/cancel
 * Cancel order
 */
export const cancelOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params
  const { reason } = req.body

  logger.info('[Orders] Cancelling order', { userId, orderId })

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payment: true,
      delivery: true
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  if (order.status === 'CANCELLED') {
    const already = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        address: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
                unit: true
              }
            }
          }
        },
        payment: {
          include: {
            refundTransactions: true
          }
        },
        refundTransactions: true,
        delivery: DELIVERY_WITH_AGENT_INCLUDE,
        pickupStore: { select: { id: true, name: true, address: true } }
      }
    })
    return successResponse(
      res,
      200,
      { order: formatOrder(already) },
      'Order already cancelled'
    )
  }

  // Check if order can be cancelled
  if (!canCancelOrder(order.status)) {
    return errorResponse(
      res,
      400,
      'Cancellation is disabled at this stage. Please contact customer care.'
    )
  }

  // Validate status transition via centralized lifecycle service.
  const statusValidation = validateOrderLifecycleTransition(order.status, 'CANCELLED')
  if (!statusValidation.valid) {
    return errorResponse(
      res,
      400,
      'Cancellation is disabled at this stage. Please contact customer care.'
    )
  }

  // Calculate cancellation fee
  const cancellationTime = new Date()
  const cancellationFee = calculateCancellationFee(order, cancellationTime)

  const cancelTxnResult = await prisma.$transaction(async (tx) => {
    const updatedRows = await tx.order.updateMany({
      where: {
        id: orderId,
        consumerId: userId,
        status: { in: [...PRISMA_CANCELLABLE_STATUSES] }
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: cancellationTime,
        cancellationReason: reason || null,
        cancelledBy: userId,
        cancellationFee
      }
    })

    if (updatedRows.count === 0) {
      return { applied: false }
    }

    await tx.delivery.updateMany({
      where: { orderId },
      data: { status: 'FAILED' }
    })

    // Restore stock for each active item (idempotent: only runs when cancel applied)
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
          data: {
            stock: {
              increment: item.quantity
            }
          }
        })
      }
    }

    // Release delivery slot for SCHEDULED orders so capacity is restored
    if (
      order.deliveryType === 'SCHEDULED' &&
      order.deliveryDate != null &&
      order.deliverySlot != null &&
      order.warehouseId != null
    ) {
      let releaseResult
      if (order.deliverySlotId) {
        try {
          await releaseDeliverySlotByIdWithTx(tx, order.deliverySlotId)
          releaseResult = { released: true }
        } catch (err) {
          releaseResult = { released: false, error: err?.message }
        }
      } else {
        releaseResult = await releaseDeliverySlotWithTxRetry(
          tx,
          order.warehouseId,
          order.deliveryDate,
          order.deliverySlot,
          order.routeMapId
        )
      }
      if (!releaseResult.released) {
        logger.warn(
          '[Orders] SLOT_RELEASE_FAILED cancel – slot capacity may need reconciliation',
          {
            code: 'SLOT_RELEASE_FAILED',
            context: 'cancel',
            orderId,
            warehouseId: order.warehouseId,
            deliveryDate: order.deliveryDate,
            deliverySlot: order.deliverySlot,
            error: releaseResult.error
          }
        )
        logger.error(
          '[Orders] Slot release failed during cancel (after retries)',
          {
            orderId,
            warehouseId: order.warehouseId,
            deliveryDate: order.deliveryDate,
            deliverySlot: order.deliverySlot,
            error: releaseResult.error
          }
        )
      }
    }

    if (order.deliveryType === 'PICKUP_STORE' && order.pickupSlotId) {
      try {
        await releasePickupSlot(tx, order)
      } catch (err) {
        logger.warn('[Orders] Pickup slot release failed on cancel', {
          orderId,
          pickupSlotId: order.pickupSlotId,
          error: err?.message
        })
      }
    }

    return { applied: true }
  })

  if (!cancelTxnResult.applied) {
    const current = await prisma.order.findUnique({ where: { id: orderId } })
    if (current?.status === 'CANCELLED') {
      const o = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          address: true,
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  images: true,
                  unit: true
                }
              }
            }
          },
          payment: {
            include: {
              refundTransactions: true
            }
          },
          refundTransactions: true,
          delivery: DELIVERY_WITH_AGENT_INCLUDE,
          pickupStore: { select: { id: true, name: true, address: true } }
        }
      })
      return successResponse(res, 200, { order: formatOrder(o) }, 'Order already cancelled')
    }
    return errorResponse(res, 409, 'Order state changed; refresh and retry cancel')
  }

  // Release/cancel reservation
  await releaseReservation({ orderId, status: 'CANCELLED' })

  void callDeliveryApi({
    path: '/order/order-status',
    method: 'PUT',
    useSyncKey: true,
    body: {
      orderId,
      status: 'CANCELLED',
      actorUserId: userId,
      actorRole: req.user.role
    }
  }).catch((syncErr) => {
    logger.warn('[Orders] Post-cancel delivery-api sync failed (non-blocking)', {
      orderId,
      message: syncErr.message
    })
  })

  if (order.payment && order.payment.status === 'SUCCESS') {
    if (order.payment.method !== 'COD' && order.payment.razorpayPaymentId) {
      const refundResult = await orchestrateOnlineRefund({
        prisma,
        payment: order.payment,
        orderId,
        orderNumber: order.orderNumber,
        reason: reason || 'Order cancelled by customer',
        requestedBy: userId,
        idempotencyKey: req.header('x-idempotency-key')
      })
      if (!refundResult.ok && !refundResult.replay) {
        logger.warn('[Orders] Online refund not finalized; payment left REFUND_PENDING for reconciliation', {
          orderId,
          paymentId: order.payment.id,
          message: refundResult.error
        })
      }
    } else {
      await prisma.payment.update({
        where: { id: order.payment.id },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date()
        }
      })
    }
  }

  // Fetch updated order
  const updatedOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      address: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              images: true,
              unit: true
            }
          }
        }
      },
      payment: {
        include: {
          refundTransactions: true
        }
      },
      refundTransactions: true,
      delivery: DELIVERY_WITH_AGENT_INCLUDE,
      pickupStore: {
        select: { id: true, name: true, address: true }
      }
    }
  })

  logger.info('[Orders] Order cancelled', { userId, orderId })
  void emitCanonicalEvent({
    eventName: CANONICAL_EVENTS.orderStatusChanged,
    entityType: 'ORDER',
    entityId: orderId,
    action: 'STATUS_CHANGED',
    payload: {
      fromStatus: order.status,
      toStatus: 'CANCELLED',
      reason: reason || null,
      actorId: userId,
      actorRole: req.user?.role || null
    },
    beforeJson: { status: order.status },
    afterJson: { status: 'CANCELLED' }
  }).catch(() => {})

  // Handle status change (creates history and sends notifications)
  try {
    const { handleOrderStatusChange } = await import(
      '../middlewares/prismaMiddleware.js'
    )
    await handleOrderStatusChange(
      orderId,
      order.status,
      'CANCELLED',
      userId,
      reason || 'Order cancelled by customer'
    )
  } catch (error) {
    logger.error('[Orders] Error handling cancellation status change', {
      error: error.message,
      orderId
    })
    // Fallback: Send notification directly if status change handler fails
    try {
      await sendOrderNotification(userId, updatedOrder, 'CANCELLED')
    } catch (notifError) {
      logger.error('[Orders] Error sending cancellation notification', {
        error: notifError.message,
        orderId
      })
    }
  }

  return successResponse(
    res,
    200,
    { order: formatOrder(updatedOrder) },
    'Order cancelled successfully'
  )
})

/**
 * GET /api/v1/orders/:orderId/tracking
 * Track order status
 */
export const trackOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params

  await cleanupStalePendingOrders(userId)

  logger.info('[Orders] Tracking order', { userId, orderId })

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      delivery: true,
      address: {
        select: {
          city: true,
          state: true,
          pincode: true
        }
      },
      statusHistory: {
        orderBy: { createdAt: 'asc' }
      },
      trackingEvents: {
        orderBy: { createdAt: 'asc' },
        take: 200
      }
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  // Build tracking timeline
  const timeline = []

  if (['CANCELLED', 'FAILED'].includes(order.status)) {
    timeline.push({
      status: 'CANCELLED',
      timestamp: order.cancelledAt || order.updatedAt || order.createdAt,
      message: order.cancellationReason || 'Order was cancelled'
    })
  } else if (order.status === 'PAYMENT_FAILED') {
    timeline.push({
      status: 'PAYMENT_FAILED',
      timestamp: order.updatedAt || order.createdAt,
      message: order.failureReason || 'Payment failed'
    })
  } else if (order.status === 'PENDING') {
    timeline.push({
      status: 'PENDING',
      timestamp: order.createdAt,
      message: 'Payment pending. Order not placed.'
    })
  } else {
    timeline.push({
      status: 'ORDER_PLACED',
      timestamp: order.createdAt,
      message: 'Order placed successfully'
    })
  }

  const isConfirmedOrBeyond =
    order.confirmedAt ||
    ['CONFIRMED', 'ACCEPTED', 'PROCESSING', 'PICKING', 'PACKING', 'READY_FOR_PICKUP', 'ASSIGNED_TO_AGENT', 'OUT_FOR_DELIVERY', 'ARRIVING_SOON', 'DELIVERED'].includes((order.status || '').toUpperCase())

  if (isConfirmedOrBeyond) {
    timeline.push({
      status: 'ORDER_CONFIRMED',
      timestamp: order.confirmedAt || order.updatedAt || order.createdAt,
      message: 'Order confirmed'
    })
  }

  const isAcceptedOrBeyond =
    order.acceptedByShopkeeperAt ||
    order.shopkeeperAcceptedAt ||
    ['ACCEPTED', 'PROCESSING', 'PICKING', 'PACKING', 'READY_FOR_PICKUP', 'ASSIGNED_TO_AGENT', 'OUT_FOR_DELIVERY', 'ARRIVING_SOON', 'DELIVERED'].includes((order.status || '').toUpperCase())

  if (isAcceptedOrBeyond) {
    timeline.push({
      status: 'ORDER_ACCEPTED',
      timestamp: order.acceptedByShopkeeperAt || order.shopkeeperAcceptedAt || order.updatedAt || order.createdAt,
      message: 'Order accepted'
    })
  }

  if (order.delivery) {
    if (order.delivery.assignedAt) {
      timeline.push({
        status: 'DELIVERY_ASSIGNED',
        timestamp: order.delivery.assignedAt,
        message: 'Delivery agent assigned'
      })
    }

    if (order.delivery.pickedUpAt) {
      timeline.push({
        status: 'PICKED_UP',
        timestamp: order.delivery.pickedUpAt,
        message: 'Order picked up from warehouse'
      })
    }

    if (order.delivery.deliveredAt) {
      timeline.push({
        status: 'DELIVERED',
        timestamp: order.delivery.deliveredAt,
        message: 'Order delivered successfully'
      })
    }
  }

  if (Array.isArray(order.statusHistory)) {
    for (const h of order.statusHistory) {
      if (!h?.toStatus || !h.createdAt) continue
      timeline.push({
        status: h.toStatus,
        timestamp: h.createdAt,
        message:
          h.reason ||
          h.notes ||
          `Order status: ${h.fromStatus || '—'} → ${h.toStatus}`
      })
    }
  }

  if (Array.isArray(order.trackingEvents)) {
    for (const ev of order.trackingEvents) {
      if (!ev?.createdAt) continue
      timeline.push({
        status: ev.eventType || 'TRACKING_EVENT',
        timestamp: ev.createdAt,
        message:
          (ev.payload && typeof ev.payload.message === 'string' && ev.payload.message) ||
          `Tracking: ${ev.eventType || 'event'}`
      })
    }
  }

  const mapStatusToStageKey = (statusStr) => {
    const upper = (statusStr || '').toUpperCase()
    if (['CANCELLED'].includes(upper)) return 'CANCELLED'
    if (['PAYMENT_FAILED'].includes(upper)) return 'PAYMENT_FAILED'
    if (['PENDING'].includes(upper)) return 'PENDING'
    if (['ORDER_PLACED', 'PLACED'].includes(upper)) return 'ORDER_PLACED'
    if (['ORDER_CONFIRMED', 'CONFIRMED'].includes(upper)) return 'ORDER_CONFIRMED'
    if (['ORDER_ACCEPTED', 'ACCEPTED', 'PROCESSING'].includes(upper)) return 'ORDER_ACCEPTED'
    if (['PICKING', 'PICKING_ITEMS'].includes(upper)) return 'PICKING_ITEMS'
    if (['PACKING', 'PACKING_ORDER'].includes(upper)) return 'PACKING_ORDER'
    if (['READY_FOR_PICKUP', 'READY_FOR_DISPATCH', 'PACKED'].includes(upper)) return 'READY_FOR_DISPATCH'
    if (['ASSIGNED_TO_AGENT', 'DELIVERY_ASSIGNED', 'ASSIGNED'].includes(upper)) return 'DELIVERY_PARTNER_ASSIGNED'
    if (['OUT_FOR_DELIVERY', 'IN_TRANSIT', 'PICKED_UP'].includes(upper)) return 'OUT_FOR_DELIVERY'
    if (['ARRIVING_SOON'].includes(upper)) return 'ARRIVING_SOON'
    if (['DELIVERED'].includes(upper)) return 'DELIVERED'
    return upper
  }

  const getCanonicalMessage = (stageKey) => {
    switch (stageKey) {
      case 'CANCELLED': return 'Order Cancelled'
      case 'PAYMENT_FAILED': return 'Payment Failed'
      case 'PENDING': return 'Payment pending. Order not placed.'
      case 'ORDER_PLACED': return 'Order placed successfully'
      case 'ORDER_CONFIRMED': return 'Order confirmed'
      case 'ORDER_ACCEPTED': return 'Order accepted'
      case 'PICKING_ITEMS': return 'Store executive is collecting items.'
      case 'PACKING_ORDER': return 'Items are being packed and quality checked.'
      case 'READY_FOR_DISPATCH': return 'Package is ready and waiting for rider assignment.'
      case 'DELIVERY_PARTNER_ASSIGNED': return 'Rider has accepted the delivery.'
      case 'OUT_FOR_DELIVERY': return 'Rider has started the delivery.'
      case 'ARRIVING_SOON': return 'Rider is nearby (ETA 2–5 minutes).'
      case 'DELIVERED': return 'Order successfully delivered.'
      default: return null
    }
  }

  const stageMap = new Map()
  for (const step of timeline.sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  )) {
    const stageKey = mapStatusToStageKey(step.status)
    const canonicalMsg = getCanonicalMessage(stageKey)

    if (!stageMap.has(stageKey)) {
      stageMap.set(stageKey, {
        status: stageKey,
        timestamp: step.timestamp,
        message: canonicalMsg || step.message
      })
    } else {
      const existing = stageMap.get(stageKey)
      if (canonicalMsg && existing.message !== canonicalMsg) {
        existing.message = canonicalMsg
      }
    }
  }

  const deduped = Array.from(stageMap.values())

  const stageInfo = resolveCustomerOrderStage(order)

  const response = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: stageInfo.status || order.status,
    rawStatus: order.status,
    currentStatus: stageInfo.status,
    consumerStatus: stageInfo.consumerStatus,
    currentStage: stageInfo.stage,
    stageName: stageInfo.stageName,
    orderStatusLabel: stageInfo.label,
    canCancel: canCancelOrder(order.status),
    cancellationDisabledMessage: canCancelOrder(order.status)
      ? null
      : 'Cancellation is disabled at this stage. Please contact customer care.',
    timeline: deduped,
    deliveryAddress: order.address
      ? {
          city: order.address.city,
          state: order.address.state,
          pincode: order.address.pincode
        }
      : null,
    estimatedDelivery: order.deliveryDate || null
  }

  return successResponse(
    res,
    200,
    response,
    'Order tracking information fetched successfully'
  )
})

/**
 * GET /api/v1/orders/:orderId/tracking/live
 * Get real-time order tracking with live location and ETA
 */
export const getLiveTracking = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params

  await cleanupStalePendingOrders(userId)

  logger.info('[Orders] Fetching live tracking', { userId, orderId })

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      delivery: {
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true
            }
          }
        }
      },
      address: {
        select: {
          id: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          pincode: true,
          location: true
        }
      },
      warehouse: {
        select: {
          id: true,
          name: true,
          location: true,
          address: true
        }
      }
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  // Consumer and assigned delivery agent only (no cross-tenant admin bypass on consumer API).
  const hasAccess =
    order.consumerId === userId || order.delivery?.agentId === userId

  if (!hasAccess) {
    return errorResponse(res, 403, 'Access denied')
  }

  // Calculate ETA if delivery agent location is available
  let eta = null
  let distance = null
  let agentLocation = null

  if (order.delivery?.currentLocation && order.address?.location) {
    agentLocation = order.delivery.currentLocation
    const destinationLocation = order.address.location

    const etaData = calculateETA(agentLocation, destinationLocation)
    eta = {
      estimatedMinutes: etaData.estimatedMinutes,
      estimatedHours: etaData.estimatedHours,
      formatted: formatETA(etaData.estimatedMinutes),
      arrivalTime: etaData.eta,
      distance: etaData.distance
    }
    distance = etaData.distance
  }

  // Build response
  const response = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    deliveryStatus: order.delivery?.status || 'PENDING',
    agent: order.delivery?.agent
      ? {
          id: order.delivery.agent.id,
          name: order.delivery.agent.name,
          phone: order.delivery.agent.phone,
          avatar: order.delivery.agent.avatar
        }
      : null,
    currentLocation: order.delivery?.currentLocation || null,
    pickupLocation:
      order.delivery?.pickupLocation ||
      (order.warehouse?.location
        ? {
            lat: order.warehouse.location.lat,
            lng: order.warehouse.location.lng,
            address: order.warehouse.address
          }
        : null),
    deliveryLocation:
      order.delivery?.deliveryLocation ||
      (order.address?.location
        ? {
            lat: order.address.location.lat,
            lng: order.address.location.lng,
            address: `${order.address.line1}, ${order.address.city}, ${order.address.pincode}`
          }
        : null),
    eta,
    distance,
    timeline: [
      ...(order.status === 'CANCELLED'
        ? [{ status: 'CANCELLED', timestamp: order.cancelledAt || order.updatedAt || order.createdAt, message: order.cancellationReason || 'Order was cancelled' }]
        : order.status === 'PAYMENT_FAILED'
        ? [{ status: 'PAYMENT_FAILED', timestamp: order.updatedAt || order.createdAt, message: order.failureReason || 'Payment failed' }]
        : order.status === 'PENDING'
        ? [{ status: 'PENDING', timestamp: order.createdAt, message: 'Payment pending. Order not placed.' }]
        : [{ status: 'ORDER_PLACED', timestamp: order.createdAt, message: 'Order placed successfully' }]),
      ...(order.confirmedAt
        ? [
            {
              status: 'ORDER_CONFIRMED',
              timestamp: order.confirmedAt,
              message: 'Order confirmed'
            }
          ]
        : []),
      ...(order.delivery?.assignedAt
        ? [
            {
              status: 'DELIVERY_ASSIGNED',
              timestamp: order.delivery.assignedAt,
              message: 'Delivery agent assigned'
            }
          ]
        : []),
      ...(order.delivery?.pickedUpAt
        ? [
            {
              status: 'PICKED_UP',
              timestamp: order.delivery.pickedUpAt,
              message: 'Order picked up from warehouse'
            }
          ]
        : []),
      ...(order.delivery?.deliveredAt
        ? [
            {
              status: 'DELIVERED',
              timestamp: order.delivery.deliveredAt,
              message: 'Order delivered successfully'
            }
          ]
        : [])
    ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
    lastUpdate: order.delivery?.currentLocation ? new Date() : order.updatedAt
  }

  return successResponse(
    res,
    200,
    response,
    'Live tracking information fetched successfully'
  )
})

/**
 * GET /api/v1/orders/:orderId/tracking-history
 * Paginated OrderTrackingEvent + DeliveryLocationHistory for consumer/agent.
 */
export const getOrderTrackingHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200)
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0)

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, consumerId: true, agentId: true, delivery: { select: { agentId: true } } }
  })
  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }
  const agentOnOrder = order.agentId || order.delivery?.agentId
  const allowed =
    order.consumerId === userId ||
    agentOnOrder === userId ||
    req.user.role === 'SUPER_ADMIN' ||
    req.user.role === 'OPERATIONAL_ADMIN'
  if (!allowed) {
    return errorResponse(res, 403, 'Access denied')
  }

  const events = await prisma.orderTrackingEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
    select: {
      id: true,
      eventType: true,
      latitude: true,
      longitude: true,
      accuracy: true,
      payload: true,
      agentId: true,
      createdAt: true
    }
  })

  const locations = await prisma.deliveryLocationHistory.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
    select: {
      id: true,
      latitude: true,
      longitude: true,
      accuracy: true,
      source: true,
      createdAt: true,
      agentId: true
    }
  })

  return successResponse(
    res,
    200,
    {
      orderId,
      events,
      locationSamples: locations,
      limit,
      offset,
      nextOffset: events.length === limit ? offset + limit : null
    },
    'Tracking history fetched successfully'
  )
})

/**
 * POST /api/v1/orders/:orderId/tracking/location
 * Update delivery agent location (for delivery agents)
 */
export const updateDeliveryLocation = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params
  const { latitude, longitude, accuracy } = req.body

  logger.info('[Orders] Updating delivery location', {
    userId,
    orderId,
    latitude,
    longitude
  })

  // Validate location
  if (!latitude || !longitude) {
    return errorResponse(res, 400, 'Latitude and longitude are required')
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return errorResponse(res, 400, 'Invalid coordinates')
  }

  // Get order and delivery
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      delivery: true,
      address: {
        select: {
          location: true
        }
      }
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  // Verify user is the assigned delivery agent
  if (order.delivery?.agentId !== userId) {
    return errorResponse(
      res,
      403,
      'Only assigned delivery agent can update location'
    )
  }

  // Update delivery location
  const location = {
    lat: latitude,
    lng: longitude,
    accuracy: accuracy || null,
    timestamp: new Date().toISOString()
  }

  const updatedDelivery = await prisma.delivery.update({
    where: { orderId },
    data: {
      currentLocation: location,
      lastLocationUpdate: new Date(),
      updatedAt: new Date()
    },
    include: {
      agent: {
        select: {
          id: true,
          name: true,
          phone: true
        }
      }
    }
  })

  await prisma.deliveryLocationHistory.create({
    data: {
      orderId,
      agentId: userId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy: accuracy != null ? Number(accuracy) : null,
      source: 'CONSUMER_API'
    }
  })

  // Calculate ETA if destination is available
  let eta = null
  let estimatedArrival = null
  if (order.address?.location) {
    const etaData = calculateETA(location, order.address.location)
    eta = {
      estimatedMinutes: etaData.estimatedMinutes,
      formatted: formatETA(etaData.estimatedMinutes),
      arrivalTime: etaData.eta,
      distance: etaData.distance
    }
    estimatedArrival = new Date(etaData.eta)

    // Update estimated arrival in database
    await prisma.delivery.update({
      where: { orderId },
      data: { estimatedArrival }
    })
  }

  await orchestratePostLocationPersist({
    orderId,
    location,
    eta,
    meta: { agentId: userId, source: 'CONSUMER_API_AGENT_LOCATION' }
  })

  logger.info('[Orders] Delivery location updated', {
    orderId,
    agentId: userId,
    location
  })

  return successResponse(
    res,
    200,
    {
      location,
      eta,
      updatedAt: updatedDelivery.updatedAt
    },
    'Location updated successfully'
  )
})

/**
 * PATCH /api/v1/orders/:orderId/delivery
 * Modify scheduled order delivery slot/date
 */
export const modifyOrderDelivery = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params
  const { deliverySlot, deliveryDate } = req.body

  logger.info('[Orders] Modifying order delivery', {
    userId,
    orderId,
    deliverySlot,
    deliveryDate
  })

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      address: true
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  // Modification allowed only for SCHEDULED orders
  if (order.deliveryType !== 'SCHEDULED') {
    return errorResponse(
      res,
      400,
      'Delivery modification allowed only for scheduled orders'
    )
  }

  const modifiableStatuses = ['PLACED', 'PENDING', 'CONFIRMED']
  if (!modifiableStatuses.includes(order.status)) {
    return errorResponse(
      res,
      400,
      `Order delivery cannot be modified. Current status: ${order.status}`
    )
  }

  if (!order.warehouseId) {
    return errorResponse(
      res,
      400,
      'Order warehouse unknown; cannot modify delivery'
    )
  }

  // For slot rebooking both new date and new slot are required
  if (deliverySlot === undefined || deliveryDate === undefined) {
    return errorResponse(
      res,
      400,
      'Both deliveryDate and deliverySlot are required to modify scheduled delivery'
    )
  }

  const newDeliveryDate = new Date(deliveryDate)
  if (isNaN(newDeliveryDate.getTime())) {
    return errorResponse(res, 400, 'Invalid delivery date')
  }
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const newDateNorm = new Date(newDeliveryDate)
  newDateNorm.setHours(0, 0, 0, 0)
  if (newDateNorm < now) {
    return errorResponse(res, 400, 'Delivery date must be in the future')
  }

  const newSlot = typeof deliverySlot === 'string' ? deliverySlot.trim() : ''
  if (!newSlot) {
    return errorResponse(res, 400, 'Delivery slot is required')
  }

  const scheduleRouteMapId = req.body.routeMapId ?? null

  const updatedOrder = await prisma.$transaction(async (tx) => {
    if (
      order.deliveryDate != null &&
      order.deliverySlot != null &&
      order.warehouseId != null
    ) {
      let releaseResult
      if (order.deliverySlotId) {
        try {
          await releaseDeliverySlotByIdWithTx(tx, order.deliverySlotId)
          releaseResult = { released: true }
        } catch (err) {
          releaseResult = { released: false, error: err?.message }
        }
      } else {
        releaseResult = await releaseDeliverySlotWithTxRetry(
          tx,
          order.warehouseId,
          order.deliveryDate,
          order.deliverySlot,
          order.routeMapId
        )
      }
      if (!releaseResult.released) {
        logger.warn(
          '[Orders] SLOT_RELEASE_FAILED modify – old slot capacity may need reconciliation',
          {
            code: 'SLOT_RELEASE_FAILED',
            context: 'modify',
            orderId,
            deliverySlot: order.deliverySlot,
            deliveryDate: order.deliveryDate,
            error: releaseResult.error
          }
        )
      }
    }

    const bookedSlotRow = await bookDeliverySlotWithTx(
      tx,
      order.warehouseId,
      newDeliveryDate,
      newSlot,
      scheduleRouteMapId || null
    )

    return tx.order.update({
      where: { id: orderId },
      data: {
        deliverySlot: newSlot,
        deliveryDate: newDeliveryDate,
        deliverySlotId: bookedSlotRow?.id ?? null
      },
      include: {
        address: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
                unit: true
              }
            }
          }
        },
        payment: true,
        delivery: DELIVERY_WITH_AGENT_INCLUDE,
        pickupStore: {
          select: { id: true, name: true, address: true }
        }
      }
    })
  })

  logger.info('[Orders] Order delivery modified', { userId, orderId })

  // Send notification about delivery modification
  try {
    await sendOrderNotification(userId, updatedOrder, order.status)
  } catch (error) {
    logger.error('[Orders] Error sending modification notification', {
      error: error.message,
      orderId
    })
  }

  return successResponse(
    res,
    200,
    { order: formatOrder(updatedOrder) },
    'Order delivery modified successfully'
  )
})

/**
 * PATCH /api/v1/orders/:orderId/items
 * Modify order items (add/remove/update quantities)
 * Only allowed in PENDING status
 */
export const modifyOrderItems = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params
  const { items, removeItems } = req.body

  logger.info('[Orders] Modifying order items', {
    userId,
    orderId,
    items,
    removeItems
  })

  // Get order
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              stock: true,
              isActive: true,
              warehouseId: true,
              taxRate: true
            }
          }
        }
      },
      warehouse: {
        select: {
          id: true,
          state: true
        }
      },
      address: {
        select: {
          state: true,
          pincode: true
        }
      }
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  // Only allow modification in PENDING status
  if (!['PLACED', 'PENDING'].includes(order.status)) {
    return errorResponse(
      res,
      400,
      `Cannot modify order in ${order.status} status. Only PLACED or PENDING orders can be modified.`
    )
  }

  // Store old data for modification history
  const oldItems = order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice
  }))

  // Validate items to add/update
  if (items && items.length > 0) {
    for (const item of items) {
      if (item.productId) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            id: true,
            name: true,
            stock: true,
            isActive: true,
            warehouseId: true,
            price: true
          }
        })

        if (!product) {
          return errorResponse(res, 400, `Product ${item.productId} not found`)
        }

        if (!product.isActive) {
          return errorResponse(
            res,
            400,
            `Product ${product.name} is not available`
          )
        }

        if (product.warehouseId !== order.warehouseId) {
          return errorResponse(
            res,
            400,
            'All items must be from the same warehouse'
          )
        }

        const requestedQuantity = item.quantity || 1
        if (product.stock < requestedQuantity) {
          return errorResponse(
            res,
            400,
            `Only ${product.stock} units available for ${product.name}`
          )
        }
      }
    }
  }

  // Modify order in transaction
  const updatedOrder = await prisma.$transaction(async (tx) => {
    // Remove items if specified
    if (removeItems && removeItems.length > 0) {
      for (const itemId of removeItems) {
        const orderItem = await tx.orderItem.findUnique({
          where: { id: itemId },
          select: { orderId: true, quantity: true, productId: true }
        })

        if (!orderItem || orderItem.orderId !== orderId) {
          continue // Skip invalid item
        }

        // Restore stock
        await tx.product.update({
          where: { id: orderItem.productId },
          data: {
            stock: {
              increment: orderItem.quantity
            }
          }
        })

        // Delete order item
        await tx.orderItem.delete({
          where: { id: itemId }
        })
      }
    }

    // Update or add items
    if (items && items.length > 0) {
      for (const item of items) {
        if (item.itemId) {
          // Update existing item
          const existingItem = await tx.orderItem.findUnique({
            where: { id: item.itemId },
            include: {
              product: {
                select: {
                  price: true,
                  stock: true,
                  taxRate: true
                }
              }
            }
          })

          if (!existingItem || existingItem.orderId !== orderId) {
            continue
          }

          const quantityDiff = item.quantity - existingItem.quantity

          if (quantityDiff !== 0) {
            // Update stock
            if (quantityDiff > 0) {
              // Increasing quantity
              if (existingItem.product.stock < quantityDiff) {
                throw new Error(
                  `Insufficient stock for ${existingItem.productId}`
                )
              }
              await tx.product.update({
                where: { id: existingItem.productId },
                data: {
                  stock: {
                    decrement: quantityDiff
                  }
                }
              })
            } else {
              // Decreasing quantity
              await tx.product.update({
                where: { id: existingItem.productId },
                data: {
                  stock: {
                    increment: Math.abs(quantityDiff)
                  }
                }
              })
            }

            // Recalculate item totals
            const unitPrice = existingItem.product.price
            const itemSubtotal = unitPrice * item.quantity
            const itemTaxBreakdown = calculateGST(
              itemSubtotal,
              order.warehouse?.state || null,
              getStateCode(order.address),
              existingItem.product.taxRate ?? DEFAULT_GST_RATE
            )
            const totalPrice =
              Math.round((itemSubtotal + itemTaxBreakdown.totalTax) * 100) / 100

            await tx.orderItem.update({
              where: { id: item.itemId },
              data: {
                quantity: item.quantity,
                totalPrice,
                taxAmount: itemTaxBreakdown.totalTax,
                cgst: itemTaxBreakdown.cgst,
                sgst: itemTaxBreakdown.sgst,
                igst: itemTaxBreakdown.igst
              }
            })
          }
        } else if (item.productId) {
          // Add new item
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: {
              price: true,
              stock: true,
              taxRate: true,
              name: true,
              images: true,
              mrp: true
            }
          })

          if (!product || product.stock < item.quantity) {
            throw new Error(`Insufficient stock for product ${item.productId}`)
          }

          // Decrement stock
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                decrement: item.quantity
              }
            }
          })

          // Calculate item totals
          const unitPrice = product.price
          const itemSubtotal = unitPrice * item.quantity
          const itemTaxBreakdown = calculateGST(
            itemSubtotal,
            order.warehouse?.state || null,
            getStateCode(order.address),
            product.taxRate ?? DEFAULT_GST_RATE
          )
          const totalPrice =
            Math.round((itemSubtotal + itemTaxBreakdown.totalTax) * 100) / 100

          // Map Product.unit (String) to OrderItem.unit (StandardUnits enum)
          const orderItemUnit = mapProductUnitToStandardUnits(product.unit)

          await tx.orderItem.create({
            data: {
              orderId,
              productId: item.productId,
              quantity: item.quantity,
              unit: orderItemUnit, // Explicitly set unit field
              unitPrice,
              totalPrice,
              productName: product.name,
              productImage: product.images?.[0] || null,
              mrp: product.mrp,
              discount: 0,
              taxAmount: itemTaxBreakdown.totalTax,
              cgst: itemTaxBreakdown.cgst,
              sgst: itemTaxBreakdown.sgst,
              igst: itemTaxBreakdown.igst,
              hsnCode: null
            }
          })
        }
      }
    }

    // Recalculate order totals
    const orderItems = await tx.orderItem.findMany({
      where: { orderId },
      include: {
        product: {
          select: {
            price: true,
            taxRate: true
          }
        }
      }
    })

    let subtotal = 0
    let totalTax = 0
    let totalCGST = 0
    let totalSGST = 0
    let totalIGST = 0

    for (const item of orderItems) {
      subtotal += item.unitPrice * item.quantity
      totalTax += item.taxAmount
      totalCGST += item.cgst
      totalSGST += item.sgst
      totalIGST += item.igst
    }

    subtotal = Math.round(subtotal * 100) / 100
    const discount = order.discount || 0
    const taxableAmount = Math.round((subtotal - discount) * 100) / 100

    // Recalculate delivery charge
    const deliveryCharge = await calculateDeliveryCharge(
      taxableAmount + totalTax,
      order.warehouseId,
      order.address.pincode
    )

    const totalAmount =
      Math.round((taxableAmount + totalTax + deliveryCharge) * 100) / 100

    // Update order
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        totalAmount,
        deliveryCharge,
        taxAmount: totalTax,
        cgst: totalCGST,
        sgst: totalSGST,
        igst: totalIGST,
        taxableAmount
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true
              }
            }
          }
        },
        address: true,
        payment: true,
        delivery: DELIVERY_WITH_AGENT_INCLUDE
      }
    })

    // Create modification history
    const { createOrderModification } = await import(
      '../utils/orderModification.js'
    )
    await createOrderModification(
      orderId,
      'ITEMS',
      { items: oldItems },
      {
        items: updated.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        }))
      },
      userId,
      'Order items modified by user'
    )

    return updated
  })

  logger.info('[Orders] Order items modified successfully', { userId, orderId })

  // Send notification
  try {
    await sendOrderNotification(userId, updatedOrder, order.status)
  } catch (error) {
    logger.error('[Orders] Error sending modification notification', {
      error: error.message,
      orderId
    })
  }

  return successResponse(
    res,
    200,
    { order: formatOrder(updatedOrder) },
    'Order items modified successfully'
  )
})

/**
 * POST /api/v1/orders/:orderId/items/:itemId/cancel
 * Cancel specific order item (partial cancellation)
 */
export const cancelOrderItem = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId, itemId } = req.params
  const { reason } = req.body

  logger.info('[Orders] Cancelling order item', { userId, orderId, itemId })

  // Get order
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        where: { id: itemId }
      }
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  // Only allow cancellation strictly BEFORE READY_FOR_PICKUP status
  if (!canCancelOrder(order.status)) {
    return errorResponse(
      res,
      400,
      `Cannot cancel items in ${order.status} status`
    )
  }

  const orderItem = order.items[0]
  if (!orderItem) {
    return errorResponse(res, 404, 'Order item not found')
  }

  if (orderItem.isCancelled) {
    return errorResponse(res, 400, 'Order item is already cancelled')
  }

  // Cancel item in transaction
  const updatedOrder = await prisma.$transaction(async (tx) => {
    // Mark item as cancelled
    await tx.orderItem.update({
      where: { id: itemId },
      data: {
        isCancelled: true,
        cancelledAt: new Date(),
        cancellationReason: reason || null,
        cancelledBy: userId
      }
    })

    // Restore stock
    await tx.product.update({
      where: { id: orderItem.productId },
      data: {
        stock: {
          increment: orderItem.quantity
        }
      }
    })

    // Recalculate order totals (exclude cancelled items)
    const activeItems = await tx.orderItem.findMany({
      where: {
        orderId,
        isCancelled: false
      }
    })

    let subtotal = 0
    let totalTax = 0
    let totalCGST = 0
    let totalSGST = 0
    let totalIGST = 0

    for (const item of activeItems) {
      subtotal += item.unitPrice * item.quantity
      totalTax += item.taxAmount
      totalCGST += item.cgst
      totalSGST += item.sgst
      totalIGST += item.igst
    }

    subtotal = Math.round(subtotal * 100) / 100
    const discount = order.discount || 0
    const taxableAmount = Math.round((subtotal - discount) * 100) / 100

    // Recalculate delivery charge
    const address = await tx.address.findUnique({
      where: { id: order.addressId },
      select: { pincode: true }
    })

    const deliveryCharge = await calculateDeliveryCharge(
      taxableAmount + totalTax,
      order.warehouseId,
      address?.pincode
    )

    const totalAmount =
      Math.round((taxableAmount + totalTax + deliveryCharge) * 100) / 100

    // Update order
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        totalAmount,
        deliveryCharge,
        taxAmount: totalTax,
        cgst: totalCGST,
        sgst: totalSGST,
        igst: totalIGST,
        taxableAmount
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true
              }
            }
          }
        },
        address: true,
        payment: true,
        delivery: DELIVERY_WITH_AGENT_INCLUDE
      }
    })

    // Create status history for item cancellation
    const { createOrderStatusHistory } = await import(
      '../utils/orderStatusHistory.js'
    )
    await createOrderStatusHistory(
      orderId,
      order.status,
      order.status, // Status doesn't change, but item is cancelled
      userId,
      `Item ${orderItem.productName} cancelled`,
      reason || null
    )

    return updated
  })

  logger.info('[Orders] Order item cancelled successfully', {
    userId,
    orderId,
    itemId
  })

  // Trigger financial refund if order was paid online
  if (order.payment && order.payment.status === 'SUCCESS') {
    try {
      const { executeFinancialResolution } = await import(
        '../services/financialOrchestrationService.js'
      )
      await executeFinancialResolution({
        prisma,
        orderId,
        orderItemId: itemId,
        refundPreference: 'ORIGINAL_PAYMENT',
        requestedAmount: orderItem.totalPrice,
        requestedBy: userId,
        reason: reason || 'Item cancelled during fulfillment',
        idempotencyKey: `cancel_item_${orderId}_${itemId}`
      })
    } catch (finErr) {
      logger.warn('[Orders] Partial refund trigger warning on item cancel', {
        orderId,
        itemId,
        error: finErr.message
      })
    }
  }

  // Send notification
  try {
    await sendOrderNotification(userId, updatedOrder, order.status)
  } catch (error) {
    logger.error('[Orders] Error sending cancellation notification', {
      error: error.message,
      orderId
    })
  }

  return successResponse(
    res,
    200,
    { order: formatOrder(updatedOrder) },
    'Order item cancelled successfully'
  )
})

/**
 * POST /api/v1/orders/:orderId/reorder
 * Reorder from previous order
 */
export const reorder = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params

  logger.info('[Orders] Reordering', { userId, orderId })

  // Get previous order
  const previousOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              stock: true,
              isActive: true,
              warehouseId: true
            }
          }
        }
      }
    }
  })

  if (!previousOrder) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (previousOrder.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  const reorderWarehouseId = normalizeWarehouseId(previousOrder.warehouseId)
  if (!reorderWarehouseId) {
    return errorResponse(res, 400, 'Cannot reorder: warehouse not found')
  }

  // Get or create warehouse cart
  const cart = await prisma.cart.findFirst({
    where: {
      userId,
      warehouseId: reorderWarehouseId
    },
    include: {
      items: true
    }
  })

  let cartToUse = cart
  if (!cart) {
    cartToUse = await prisma.cart.create({
      data: {
        userId,
        warehouseId: reorderWarehouseId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      },
      include: {
        items: true
      }
    })
  }

  // Add items to cart
  const addedItems = []
  const skippedItems = []

  for (const orderItem of previousOrder.items) {
    // Skip cancelled items
    if (orderItem.isCancelled) {
      skippedItems.push({
        productId: orderItem.productId,
        productName: orderItem.productName,
        reason: 'Item was cancelled in previous order'
      })
      continue
    }

    const product = orderItem.product

    // Check if product still exists and is active
    if (!product || !product.isActive) {
      skippedItems.push({
        productId: orderItem.productId,
        productName: orderItem.productName,
        reason: 'Product is no longer available'
      })
      continue
    }

    // Check stock
    if (product.stock < orderItem.quantity) {
      skippedItems.push({
        productId: orderItem.productId,
        productName: orderItem.productName,
        requested: orderItem.quantity,
        available: product.stock,
        reason: `Only ${product.stock} units available`
      })
      // Add available quantity if any
      if (product.stock > 0) {
        const availableQuantity = product.stock
        const existingCartItem = await prisma.cartItem.findFirst({
          where: {
            cartId: cartToUse.id,
            productId: product.id,
            productVariantId: null
          }
        })

        if (existingCartItem) {
          await prisma.cartItem.update({
            where: { id: existingCartItem.id },
            data: {
              quantity: existingCartItem.quantity + availableQuantity,
              snapshotPrice: product.price,
              priceUpdatedAt: new Date()
            }
          })
        } else {
          await prisma.cartItem.create({
            data: {
              cartId: cartToUse.id,
              productId: product.id,
              productVariantId: null,
              quantity: availableQuantity,
              snapshotPrice: product.price,
              priceUpdatedAt: new Date()
            }
          })
        }
        addedItems.push({
          productId: product.id,
          productName: product.name,
          quantity: availableQuantity,
          note: `Only ${availableQuantity} units added (${orderItem.quantity} requested)`
        })
      }
      continue
    }

    // Add item to cart (product-only reorder; no variant)
    const existingCartItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cartToUse.id,
        productId: product.id,
        productVariantId: null
      }
    })

    if (existingCartItem) {
      await prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: {
          quantity: existingCartItem.quantity + orderItem.quantity,
          snapshotPrice: product.price,
          priceUpdatedAt: new Date()
        }
      })
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cartToUse.id,
          productId: product.id,
          productVariantId: null,
          quantity: orderItem.quantity,
          snapshotPrice: product.price,
          priceUpdatedAt: new Date()
        }
      })
    }

    addedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: orderItem.quantity
    })
  }

  // Keep reorder output consistent with cart/checkout sanitization rules.
  const latestCart = await prisma.cart.findFirst({
    where: { id: cartToUse.id },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              isActive: true,
              warehouseId: true
            }
          },
          productVariant: {
            select: {
              id: true,
              isEnabled: true,
              status: true
            }
          }
        }
      }
    }
  })
  await validateAndSanitizeCart(prisma, latestCart, reorderWarehouseId, {
    resetCartMetaWhenEmpty: true
  })

  logger.info('[Orders] Reorder completed', {
    userId,
    orderId,
    added: addedItems.length,
    skipped: skippedItems.length
  })

  return successResponse(
    res,
    200,
    {
      addedItems,
      skippedItems,
      message: `Added ${addedItems.length} item(s) to cart${skippedItems.length > 0 ? `, ${skippedItems.length} item(s) skipped` : ''}`
    },
    'Items added to cart successfully'
  )
})

/**
 * GET /api/v1/orders/:orderId/invoice
 * Generate order invoice
 */
export const getOrderInvoice = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params

  logger.info('[Orders] Generating invoice', { userId, orderId })

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              unit: true
            }
          }
        }
      },
      address: true,
      payment: true,
      warehouse: {
        select: {
          name: true,
          address: true,
          phone: true
        }
      },
      consumer: {
        select: {
          name: true,
          phone: true,
          email: true
        }
      }
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  if (order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  // Generate invoice data
  const invoice = {
    invoiceNumber: order.orderNumber,
    invoiceDate: order.createdAt,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt
    },
    customer: {
      name: order.consumer.name,
      phone: order.consumer.phone,
      email: order.consumer.email
    },
    shippingAddress: {
      line1: order.address.line1,
      line2: order.address.line2,
      city: order.address.city,
      state: order.address.state,
      pincode: order.address.pincode
    },
    warehouse: order.warehouse
      ? {
          name: order.warehouse.name,
          address: order.warehouse.address,
          phone: order.warehouse.phone
        }
      : null,
    items: order.items
      .filter((item) => !item.isCancelled)
      .map((item) => ({
        name: item.productName || item.product?.name || 'Product',
        quantity: item.quantity,
        unit: getOrderItemUnit(item, item.product), // Use OrderItem.unit with fallback
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        discount: item.discount,
        taxAmount: item.taxAmount,
        cgst: item.cgst,
        sgst: item.sgst,
        igst: item.igst,
        hsnCode: item.hsnCode
      })),
    summary: {
      subtotal: order.taxableAmount + order.discount,
      discount: order.discount,
      taxableAmount: order.taxableAmount,
      taxAmount: order.taxAmount,
      cgst: order.cgst,
      sgst: order.sgst,
      igst: order.igst,
      deliveryCharge: order.deliveryCharge,
      totalAmount: order.totalAmount
    },
    payment: order.payment
      ? {
          method: order.payment.method,
          status: order.payment.status,
          amount: order.payment.amount
        }
      : null
  }

  // For now, return JSON invoice
  // TODO: Generate PDF invoice using a library like pdfkit or puppeteer
  return successResponse(
    res,
    200,
    { invoice },
    'Invoice generated successfully'
  )
})

/**
 * GET /api/v1/orders/slots/availability
 * Get available delivery slots for a date and warehouse.
 * Optional: addressId or pincode for route filtering (only slots for that address's route + legacy slots).
 */
export const getAvailableSlots = asyncHandler(async (req, res) => {
  const { warehouseId, date, addressId, pincode } = req.query

  logger.info('[Orders] Getting available slots', {
    warehouseId,
    date,
    addressId: addressId || undefined
  })

  if (!warehouseId || !date) {
    return errorResponse(res, 400, 'warehouseId and date are required')
  }

  const {
    getAvailableSlots: getSlots,
    resolveRouteMapIdsForAddress,
    resolveRouteMapIdsForPincode
  } = await import('../utils/deliverySlotUtils.js')
  const { getBlackoutDatesForWarehouse } = await import(
    '../services/deliveryConfigurationService.js'
  )

  const deliveryDate = new Date(date)
  const dateOnly = new Date(
    Date.UTC(
      deliveryDate.getFullYear(),
      deliveryDate.getMonth(),
      deliveryDate.getDate()
    )
  )
  const blackoutSet = await getBlackoutDatesForWarehouse(
    warehouseId,
    dateOnly,
    dateOnly
  )
  const dateStr = dateOnly.toISOString().slice(0, 10)
  if (blackoutSet.has(dateStr)) {
    return successResponse(
      res,
      200,
      { slots: [] },
      'Available slots fetched successfully'
    )
  }

  let routeMapIds
  if (addressId && addressId.trim()) {
    const address = await prisma.address.findFirst({
      where: { id: addressId.trim(), userId: req.user.id },
      select: { id: true }
    })
    if (address) {
      routeMapIds = await resolveRouteMapIdsForAddress(
        warehouseId,
        addressId.trim()
      )
    }
  } else if (pincode && String(pincode).trim()) {
    routeMapIds = await resolveRouteMapIdsForPincode(
      warehouseId,
      String(pincode).trim()
    )
  }
  const options = Array.isArray(routeMapIds) ? { routeMapIds } : {}
  const slots = await getSlots(warehouseId, deliveryDate, options)

  return successResponse(
    res,
    200,
    { slots },
    'Available slots fetched successfully'
  )
})

/**
 * POST /api/v1/orders/:orderId/assign-agent
 * Assign delivery agent to order
 */
export const assignDeliveryAgent = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const userRole = req.user.role
  const { orderId } = req.params
  const { agentId } = req.body

  logger.info('[Orders] Assigning delivery agent', { userId, orderId, agentId })

  // Check if user has permission (admin or warehouse staff)
  if (
    !['SUPER_ADMIN', 'OPERATIONAL_ADMIN', 'WAREHOUSE_STAFF'].includes(userRole)
  ) {
    return errorResponse(
      res,
      403,
      'Only admins and warehouse staff can assign agents'
    )
  }

  if (!agentId) {
    return errorResponse(res, 400, 'agentId is required')
  }

  // Get order
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      delivery: DELIVERY_WITH_AGENT_INCLUDE,
      address: {
        select: {
          location: true
        }
      }
    }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  // Check if order is in valid status for agent assignment
  if (order.status !== 'READY_FOR_PICKUP') {
    return errorResponse(
      res,
      400,
      `Cannot assign agent. Order must be READY_FOR_PICKUP. Current status: ${order.status}`
    )
  }

  // Verify agent exists and is a delivery agent
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      isOnline: true
    }
  })

  if (!agent) {
    return errorResponse(res, 404, 'Agent not found')
  }

  if (agent.role !== 'DELIVERY_AGENT') {
    return errorResponse(res, 400, 'User is not a delivery agent')
  }

  if (!agent.isActive) {
    return errorResponse(res, 400, 'Agent is not active')
  }

  await callDeliveryApi({
    path: '/order/order-status',
    method: 'PUT',
    useSyncKey: true,
    body: {
      orderId,
      status: 'ASSIGNED_TO_AGENT',
      assignedAgentId: agentId,
      actorUserId: userId,
      actorRole: userRole
    }
  })

  const amount = Number(order.deliveryCharge) || 0
  await prisma.deliveryAssignment.upsert({
    where: { orderId },
    update: {
      agentId,
      warehouseId: order.warehouseId ?? undefined,
      orderNumber: order.orderNumber ?? undefined,
      amount,
      status: 'UNPAID',
      assignedFrom: userId,
      updatedAt: new Date()
    },
    create: {
      orderId,
      agentId,
      warehouseId: order.warehouseId ?? undefined,
      orderNumber: order.orderNumber ?? undefined,
      amount,
      status: 'UNPAID',
      assignedFrom: userId
    }
  })

  const updatedOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      address: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              images: true
            }
          }
        }
      },
      payment: true,
      delivery: DELIVERY_WITH_AGENT_INCLUDE
    }
  })

  logger.info('[Orders] Delivery agent assigned', {
    orderId,
    agentId,
    assignedBy: userId
  })

  return successResponse(
    res,
    200,
    {
      order: formatOrder(updatedOrder),
      agent: {
        id: agent.id,
        name: agent.name
      }
    },
    'Delivery agent assigned successfully'
  )
})

/**
 * Reusable helper function to confirm an order.
 * Verifies stock and transitions the status to CONFIRMED.
 */
export async function executeOrderConfirmation(orderId, actorUserId, actorRole) {
  // Get order
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              stock: true
            }
          }
        }
      }
    }
  })

  if (!order) {
    throw new Error('Order not found')
  }

  // Check if order can be confirmed
  if (!['PLACED', 'PENDING'].includes(order.status)) {
    // If it's already CONFIRMED or something else, we don't throw, we just return the order
    return order
  }

  // Verify stock availability
  const stockIssues = []
  for (const item of order.items) {
    if (item.product.stock < item.quantity) {
      stockIssues.push({
        productId: item.productId,
        requested: item.quantity,
        available: item.product.stock
      })
    }
  }

  if (stockIssues.length > 0) {
    throw new Error(`Insufficient stock for some items: ${JSON.stringify(stockIssues)}`)
  }

  const newStatus = 'CONFIRMED'

  await callDeliveryApi({
    path: '/order/order-status',
    method: 'PUT',
    useSyncKey: true,
    body: {
      orderId,
      status: newStatus,
      actorUserId,
      actorRole
    }
  })

  const confirmedOrder = await prisma.order.update({
    where: { id: orderId },
    data: {
      confirmedAt: order.confirmedAt || new Date()
    },
    include: {
      address: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              images: true
            }
          }
        }
      },
      payment: true,
      delivery: DELIVERY_WITH_AGENT_INCLUDE
    }
  })

  const { handleOrderStatusChange } = await import('../middlewares/prismaMiddleware.js')
  await handleOrderStatusChange(
    orderId,
    order.status,
    newStatus,
    actorUserId,
    'Order confirmed automatically'
  )

  logger.info('[Orders] Order confirmed', {
    orderId,
    confirmedBy: actorUserId,
    newStatus
  })
  void emitCanonicalEvent({
    eventName: CANONICAL_EVENTS.orderStatusChanged,
    entityType: 'ORDER',
    entityId: orderId,
    action: 'STATUS_CHANGED',
    payload: {
      fromStatus: order.status,
      toStatus: newStatus,
      reason: 'Order confirmed automatically',
      actorId: actorUserId,
      actorRole
    },
    beforeJson: { status: order.status },
    afterJson: { status: newStatus }
  }).catch(() => {})

  return confirmedOrder
}

/**
 * POST /api/v1/orders/:orderId/confirm
 * Confirm order (warehouse confirmation)
 */
export const confirmOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const userRole = req.user.role
  const { orderId } = req.params

  logger.info('[Orders] Confirming order', { userId, orderId })

  // Check if user has permission (admin or warehouse staff)
  if (
    !['SUPER_ADMIN', 'OPERATIONAL_ADMIN', 'WAREHOUSE_STAFF'].includes(userRole)
  ) {
    return errorResponse(
      res,
      403,
      'Only admins and warehouse staff can confirm orders'
    )
  }

  try {
    const confirmedOrder = await executeOrderConfirmation(orderId, userId, userRole)
    return successResponse(
      res,
      200,
      {
        order: formatOrder(confirmedOrder)
      },
      'Order confirmed successfully'
    )
  } catch (err) {
    return errorResponse(res, 400, err.message)
  }
})
