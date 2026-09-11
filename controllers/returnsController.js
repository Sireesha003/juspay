// controllers/returnsController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { validateOrderLifecycleTransition } from '../services/orderLifecycleService.js'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const RETURN_WINDOW_DAYS = 7 // Days after delivery to allow returns

/**
 * Check if order is eligible for return
 */
function isEligibleForReturn(order) {
  if (order.status !== 'DELIVERED') {
    return { eligible: false, reason: 'Order must be delivered before return can be requested' }
  }
  const actualDeliveredAt = order.deliveredAt || (order.delivery && order.delivery.deliveredAt)

  if (!actualDeliveredAt) {
    return { eligible: false, reason: 'Delivery date not found' }
  }

  const deliveredAt = new Date(actualDeliveredAt)
  const now = new Date()
  const daysSinceDelivery = Math.floor((now - deliveredAt) / (1000 * 60 * 60 * 24))

  if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
    return { eligible: false, reason: `Return window expired. Returns allowed within ${RETURN_WINDOW_DAYS} days of delivery` }
  }

  // Check if there's already a pending or approved return
  // This will be checked in the controller

  return { eligible: true }
}

/**
 * Calculate refund amount for return
 */
function calculateRefundAmount(order, orderItemId = null) {
  if (orderItemId) {
    // Partial return - return specific item amount
    const item = order.items.find(i => i.id === orderItemId)
    if (!item) return 0
    return item.totalPrice
  } else {
    // Full order return
    return order.totalAmount
  }
}

/**
 * Format return for response
 */
function formatReturn(orderReturn) {
  return {
    id: orderReturn.id,
    orderId: orderReturn.orderId,
    orderItemId: orderReturn.orderItemId,
    reason: orderReturn.reason,
    status: orderReturn.status,
    requestedAt: orderReturn.requestedAt,
    approvedAt: orderReturn.approvedAt,
    rejectedAt: orderReturn.rejectedAt,
    rejectionReason: orderReturn.rejectionReason,
    processedAt: orderReturn.processedAt,
    refundedAt: orderReturn.refundedAt,
    refundAmount: orderReturn.refundAmount,
    refundMethod: orderReturn.refundMethod,
    notes: orderReturn.notes,
    createdAt: orderReturn.createdAt,
    updatedAt: orderReturn.updatedAt,
    order: orderReturn.order ? {
      id: orderReturn.order.id,
      orderNumber: orderReturn.order.orderNumber,
      status: orderReturn.order.status,
      totalAmount: orderReturn.order.totalAmount
    } : null,
    orderItem: orderReturn.orderItem ? {
      id: orderReturn.orderItem.id,
      product: orderReturn.orderItem.product ? {
        id: orderReturn.orderItem.product.id,
        name: orderReturn.orderItem.product.name,
        images: orderReturn.orderItem.product.images || []
      } : null,
      quantity: orderReturn.orderItem.quantity,
      unitPrice: orderReturn.orderItem.unitPrice,
      totalPrice: orderReturn.orderItem.totalPrice
    } : null
  }
}

/**
 * POST /api/v1/orders/:orderId/return
 * Initiate return request
 */
export const initiateReturn = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params
  const { reason, description, evidence, items } = req.body

  logger.info('[Returns] Initiating return', { userId, orderId, reason })

  // Get order with delivery and items
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      delivery: true,
      items: {
        include: {
          product: {
            select: { id: true, name: true, images: true }
          }
        }
      },
      orderReturnHistory: {
        where: {
          toPhase: {
            notIn: ['REJECTED', 'CANCELLED']
          }
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

  // Check eligibility
  const eligibility = isEligibleForReturn(order)
  if (!eligibility.eligible) {
    return errorResponse(res, 400, eligibility.reason)
  }

  // Validate items
  let requestedAmount = 0;
  const processedItems = [];

  for (const requestedItem of items) {
    const orderItem = order.items.find(i => i.id === requestedItem.orderItemId)
    if (!orderItem) {
      return errorResponse(res, 400, `Order item ${requestedItem.orderItemId} not found`)
    }
    
    // Check if already returned/processing
    let alreadyReturnedQty = 0;
    if (order.orderReturnHistory) {
      for (const history of order.orderReturnHistory) {
        if (history.metadata && history.metadata.items) {
          const matched = history.metadata.items.find(i => i.orderItemId === requestedItem.orderItemId && !['REJECTED', 'CANCELLED'].includes(i.status));
          if (matched) {
             alreadyReturnedQty += matched.quantity;
          }
        }
      }
    }
    
    if (alreadyReturnedQty + requestedItem.quantity > orderItem.quantity) {
       return errorResponse(res, 400, `Cannot return ${requestedItem.quantity} of ${orderItem.productName || 'item'}. Exceeds purchasable limit.`)
    }

    const itemRefundAmount = (orderItem.totalPrice / orderItem.quantity) * requestedItem.quantity;
    requestedAmount += itemRefundAmount;

    processedItems.push({
      orderItemId: orderItem.id,
      partnerId: orderItem.partnerId || null,
      quantity: requestedItem.quantity,
      requestedAmount: itemRefundAmount,
      approvedAmount: 0,
      status: 'PARTNER_APPROVAL_PENDING',
      partnerDecision: null
    })
  }

  const transition = validateOrderLifecycleTransition(order.status, 'RETURN_INITIATED')
  if (!transition.valid) {
    return errorResponse(res, 400, transition.error || 'Invalid order state for return')
  }

  try {
    const orderReturn = await prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.order.updateMany({
        where: {
          id: orderId,
          consumerId: userId,
          status: 'DELIVERED'
        },
        data: { status: 'RETURN_INITIATED' }
      })
      
      if (statusUpdate.count === 0) {
        const err = new Error('Order state changed; return may already be in progress')
        err.code = 'CONFLICT'
        throw err
      }

      const createdReturn = await tx.orderReturnHistory.create({
        data: {
          orderId,
          fromPhase: null,
          toPhase: 'REQUESTED',
          reason,
          actorId: userId,
          metadata: {
            type: 'RETURN',
            description: description || null,
            requestedAmount,
            evidence: evidence || [],
            items: processedItems
          }
        }
      })

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'DELIVERED',
          toStatus: 'RETURN_INITIATED',
          changedBy: userId,
          reason: reason || 'Return initiated'
        }
      })

      return createdReturn;
    })

    logger.info('[Returns] Return request created', { userId, orderId, returnId: orderReturn.id })

    return successResponse(res, 201, { return: orderReturn }, 'Return request initiated successfully')
  } catch (e) {
    if (e.code === 'CONFLICT') {
      return errorResponse(res, 409, e.message)
    }
    throw e
  }
})

/**
 * GET /api/v1/orders/:orderId/return
 * Get return status for an order
 */
export const getReturnStatus = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params

  logger.info('[Returns] Fetching return status', { userId, orderId })

  const orderReturns = await prisma.orderReturnHistory.findMany({
    where: {
      orderId,
      actorId: userId
    },
    orderBy: { createdAt: 'desc' },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true
        }
      }
    }
  })

  if (!orderReturns.length) {
    return errorResponse(res, 404, 'No return requests found for this order')
  }

  return successResponse(res, 200, { returns: orderReturns }, 'Return status fetched successfully')
})

/**
 * GET /api/v1/returns
 * Get user's return requests
 */
export const getUserReturns = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { status, page: pageParam, limit: limitParam } = req.query

  // Validate and constrain pagination parameters
  const pageNum = Math.max(1, parseInt(pageParam) || 1)
  const limitNum = Math.min(
    Math.max(1, parseInt(limitParam) || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  )

  logger.info('[Returns] Fetching user returns', { userId, status, page: pageNum, limit: limitNum })

  const where = {
    actorId: userId
  }

  if (status) {
    where.toPhase = status
  }

  const skip = (pageNum - 1) * limitNum
  const take = limitNum

  const [returns, total] = await Promise.all([
    prisma.orderReturnHistory.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true
          }
        }
      }
    }),
    prisma.orderReturnHistory.count({ where })
  ])

  const totalPages = Math.ceil(total / take)

  return successResponse(res, 200, {
    returns,
    pagination: {
      page: pageNum,
      limit: take,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    }
  }, 'Returns fetched successfully')
})

/**
 * POST /api/v1/returns/:returnId/cancel
 * Cancel return request
 */
export const cancelReturn = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { returnId } = req.params

  logger.info('[Returns] Cancelling return', { userId, returnId })

  const orderReturn = await prisma.orderReturnHistory.findUnique({
    where: { id: returnId },
    include: {
      order: {
        select: {
          id: true,
          consumerId: true,
          status: true
        }
      }
    }
  })

  if (!orderReturn) {
    return errorResponse(res, 404, 'Return request not found')
  }

  if (orderReturn.actorId !== userId && orderReturn.order.consumerId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  // Only allow cancellation if status is REQUESTED or PARTNER_APPROVAL_PENDING
  if (!['REQUESTED', 'PARTNER_APPROVAL_PENDING'].includes(orderReturn.toPhase)) {
    return errorResponse(res, 400, `Cannot cancel return request. Current status: ${orderReturn.toPhase}`)
  }

  try {
    const updatedReturn = await prisma.$transaction(async (tx) => {
      const canceled = await tx.orderReturnHistory.update({
        where: { id: returnId },
        data: { 
          fromPhase: orderReturn.toPhase,
          toPhase: 'CANCELLED',
          metadata: {
             ...(typeof orderReturn.metadata === 'object' && orderReturn.metadata ? orderReturn.metadata : {}),
             cancellationReason: 'Cancelled by user',
             cancelledAt: new Date().toISOString()
          }
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              totalAmount: true
            }
          }
        }
      })

      // Check if this was the last active return for this order
      const activeReturns = await tx.orderReturnHistory.count({
        where: {
          orderId: orderReturn.orderId,
          id: { not: returnId },
          toPhase: { notIn: ['CANCELLED', 'REJECTED', 'COMPLETED'] }
        }
      })

      if (activeReturns === 0 && orderReturn.order.status === 'RETURN_INITIATED') {
        await tx.order.update({
          where: { id: orderReturn.orderId },
          data: { status: 'DELIVERED' }
        })

        await tx.orderStatusHistory.create({
          data: {
            orderId: orderReturn.orderId,
            fromStatus: orderReturn.order.status,
            toStatus: 'DELIVERED',
            changedBy: userId,
            reason: 'Return cancelled'
          }
        })
      }

      return canceled
    })

    logger.info('[Returns] Return request cancelled', { userId, returnId })

    return successResponse(res, 200, { return: updatedReturn }, 'Return request cancelled successfully')
  } catch (error) {
    throw error
  }
})

/**
 * GET /api/v1/refunds (and /api/v1/user/refunds, /api/v1/payments/refunds)
 * Get user's complete refund history (including cancelled online orders, return refunds, and gateway refunds)
 */
export const getUserRefunds = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { status, page: pageParam, limit: limitParam } = req.query

  const pageNum = Math.max(1, parseInt(pageParam) || 1)
  const limitNum = Math.min(
    Math.max(1, parseInt(limitParam) || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  )

  logger.info('[Refunds] Fetching user refunds', { userId, status, page: pageNum, limit: limitNum })

  // Query all orders of this user that have refunds
  const orders = await prisma.order.findMany({
    where: {
      consumerId: userId,
      OR: [
        {
          payment: {
            status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_PENDING'] }
          }
        },
        {
          refundTransactions: {
            some: {}
          }
        },
        {
          orderReturnHistory: {
            some: {}
          }
        }
      ]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      payment: {
        include: {
          refundTransactions: {
            orderBy: { createdAt: 'desc' }
          }
        }
      },
      refundTransactions: {
        orderBy: { createdAt: 'desc' }
      },
      items: {
        include: {
          product: {
            select: { id: true, name: true, images: true, unit: true }
          }
        }
      },
      orderReturnHistory: {
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  const allRefunds = []

  for (const order of orders) {
    const payment = order.payment
    const refundTxs = order.refundTransactions || payment?.refundTransactions || []
    const isPaid = payment && ['SUCCESS', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_PENDING'].includes(payment.status)

    if (!isPaid && refundTxs.length === 0 && (!order.orderReturnHistory || order.orderReturnHistory.length === 0)) {
      continue
    }

    if (refundTxs.length > 0) {
      for (const tx of refundTxs) {
        allRefunds.push({
          id: tx.id,
          refundId: tx.id,
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderStatus: order.status,
          amount: Number(tx.amount || order.totalAmount || 0),
          refundAmount: Number(tx.amount || order.totalAmount || 0),
          currency: tx.currency || 'INR',
          status: tx.status,
          gatewayRefundId: tx.gatewayRefundId || payment?.razorpayRefundId || null,
          paymentMethod: payment?.method || 'ONLINE',
          reason: order.cancellationReason || 'Order cancelled',
          type: order.status === 'CANCELLED' ? 'ORDER_CANCELLATION' : 'ITEM_RETURN',
          refundedAt: tx.finalizedAt || tx.createdAt || payment?.refundedAt || order.cancelledAt || order.updatedAt,
          createdAt: tx.createdAt || payment?.refundedAt || order.cancelledAt || order.createdAt,
          items: (order.items || []).map((item) => ({
            id: item.id,
            name: item.product?.name || item.productName || 'Product',
            image: (item.product?.images && item.product.images[0]) || item.productImage || null,
            quantity: item.quantity,
            totalPrice: item.totalPrice
          }))
        })
      }
    } else if (payment && (payment.status === 'REFUNDED' || payment.status === 'REFUND_PENDING' || payment.status === 'PARTIALLY_REFUNDED')) {
      allRefunds.push({
        id: payment.id,
        refundId: payment.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        amount: Number(payment.amount || order.totalAmount || 0),
        refundAmount: Number(payment.amount || order.totalAmount || 0),
        currency: 'INR',
        status: payment.status === 'REFUNDED' ? 'SUCCEEDED' : 'PENDING',
        gatewayRefundId: payment.razorpayRefundId || null,
        paymentMethod: payment.method || 'ONLINE',
        reason: order.cancellationReason || 'Order cancelled',
        type: 'ORDER_CANCELLATION',
        refundedAt: payment.refundedAt || order.cancelledAt || order.updatedAt,
        createdAt: payment.refundedAt || order.cancelledAt || order.createdAt,
        items: (order.items || []).map((item) => ({
          id: item.id,
          name: item.product?.name || item.productName || 'Product',
          image: (item.product?.images && item.product.images[0]) || item.productImage || null,
          quantity: item.quantity,
          totalPrice: item.totalPrice
        }))
      })
    }
  }

  // Filter by status if query parameter provided
  let filtered = allRefunds
  if (status) {
    const s = status.toUpperCase()
    filtered = allRefunds.filter((r) => (r.status || '').toUpperCase() === s)
  }

  const total = filtered.length
  const skip = (pageNum - 1) * limitNum
  const paginated = filtered.slice(skip, skip + limitNum)
  const totalPages = Math.ceil(total / limitNum)

  return successResponse(
    res,
    200,
    {
      refunds: paginated,
      returns: paginated, // Alias for clients expecting 'returns'
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    },
    'Refunds fetched successfully'
  )
})

/**
 * GET /api/v1/refunds/:refundId
 * Get specific refund details
 */
export const getRefundById = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { refundId } = req.params

  logger.info('[Refunds] Fetching refund by ID', { userId, refundId })

  // Search in RefundTransaction
  const refundTx = await prisma.refundTransaction.findUnique({
    where: { id: refundId },
    include: {
      order: {
        include: {
          payment: true,
          items: {
            include: {
              product: {
                select: { id: true, name: true, images: true, unit: true }
              }
            }
          }
        }
      },
      payment: true
    }
  })

  if (refundTx && refundTx.order.consumerId === userId) {
    return successResponse(
      res,
      200,
      {
        refund: {
          id: refundTx.id,
          refundId: refundTx.id,
          orderId: refundTx.orderId,
          orderNumber: refundTx.order.orderNumber,
          orderStatus: refundTx.order.status,
          amount: Number(refundTx.amount || refundTx.order.totalAmount || 0),
          refundAmount: Number(refundTx.amount || refundTx.order.totalAmount || 0),
          currency: refundTx.currency || 'INR',
          status: refundTx.status,
          gatewayRefundId: refundTx.gatewayRefundId || refundTx.payment?.razorpayRefundId || null,
          paymentMethod: refundTx.payment?.method || 'ONLINE',
          reason: refundTx.order.cancellationReason || 'Order cancelled',
          type: refundTx.order.status === 'CANCELLED' ? 'ORDER_CANCELLATION' : 'ITEM_RETURN',
          refundedAt: refundTx.finalizedAt || refundTx.createdAt,
          createdAt: refundTx.createdAt,
          items: (refundTx.order.items || []).map((item) => ({
            id: item.id,
            name: item.product?.name || item.productName || 'Product',
            image: (item.product?.images && item.product.images[0]) || item.productImage || null,
            quantity: item.quantity,
            totalPrice: item.totalPrice
          }))
        }
      },
      'Refund details fetched successfully'
    )
  }

  // Fallback search in Payment
  const payment = await prisma.payment.findUnique({
    where: { id: refundId },
    include: {
      order: {
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, images: true, unit: true }
              }
            }
          }
        }
      }
    }
  })

  if (payment && payment.order.consumerId === userId) {
    return successResponse(
      res,
      200,
      {
        refund: {
          id: payment.id,
          refundId: payment.id,
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber,
          orderStatus: payment.order.status,
          amount: Number(payment.amount || payment.order.totalAmount || 0),
          refundAmount: Number(payment.amount || payment.order.totalAmount || 0),
          currency: 'INR',
          status: payment.status === 'REFUNDED' ? 'SUCCEEDED' : 'PENDING',
          gatewayRefundId: payment.razorpayRefundId || null,
          paymentMethod: payment.method || 'ONLINE',
          reason: payment.order.cancellationReason || 'Order cancelled',
          type: 'ORDER_CANCELLATION',
          refundedAt: payment.refundedAt || payment.order.cancelledAt || payment.order.updatedAt,
          createdAt: payment.refundedAt || payment.order.cancelledAt || payment.order.createdAt,
          items: (payment.order.items || []).map((item) => ({
            id: item.id,
            name: item.product?.name || item.productName || 'Product',
            image: (item.product?.images && item.product.images[0]) || item.productImage || null,
            quantity: item.quantity,
            totalPrice: item.totalPrice
          }))
        }
      },
      'Refund details fetched successfully'
    )
  }

  return errorResponse(res, 404, 'Refund not found')
})


