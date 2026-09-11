import { prisma } from '../config/prismaClient.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'

// Helper to compute the next delivery date
function getNextDeliveryDate(frequency) {
  const date = new Date()
  date.setHours(8, 0, 0, 0) // Default delivery time at 8:00 AM
  
  if (frequency === 'DAILY') {
    date.setDate(date.getDate() + 1)
  } else if (frequency === 'WEEKLY') {
    date.setDate(date.getDate() + 7)
  } else {
    // Custom fallback to tomorrow
    date.setDate(date.getDate() + 1)
  }
  return date
}

/**
 * Create a new product subscription
 * POST /api/v1/subscriptions
 */
export const createSubscription = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { productId, quantity = 1, frequency = 'DAILY' } = req.body

  if (!productId) {
    return errorResponse(res, 400, 'Product ID (productId) is required')
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId }
    })

    if (!product) {
      return errorResponse(res, 404, 'Product not found')
    }

    const nextDelivery = getNextDeliveryDate(frequency)

    const subscription = await prisma.consumerSubscription.create({
      data: {
        userId,
        productId,
        quantity: parseInt(quantity, 10),
        frequency,
        status: 'ACTIVE',
        nextDelivery
      },
      include: {
        product: {
          select: { name: true, price: true, finalPrice: true, images: true }
        }
      }
    })

    logger.info('Product subscription created', { userId, subscriptionId: subscription.id })
    return successResponse(res, 201, subscription, 'Subscription created successfully')
  } catch (error) {
    logger.error('Error creating subscription', { userId, error: error.message })
    return errorResponse(res, 500, 'Failed to create subscription')
  }
})

/**
 * Get all user subscriptions
 * GET /api/v1/subscriptions
 */
export const getSubscriptions = asyncHandler(async (req, res) => {
  const userId = req.user.id

  try {
    const subscriptions = await prisma.consumerSubscription.findMany({
      where: { userId },
      include: {
        Product: {
          select: { id: true, name: true, price: true, finalPrice: true, images: true, unit: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return successResponse(res, 200, subscriptions, 'Subscriptions retrieved successfully')
  } catch (error) {
    logger.error('Error fetching subscriptions', { userId, error: error.message })
    return errorResponse(res, 500, 'Failed to fetch subscriptions')
  }
})

/**
 * Update subscription status
 * PATCH /api/v1/subscriptions/:id
 */
export const updateSubscriptionStatus = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { id } = req.params
  const { status } = req.body

  if (!['ACTIVE', 'PAUSED', 'CANCELLED'].includes(status)) {
    return errorResponse(res, 400, 'Invalid status. Must be ACTIVE, PAUSED, or CANCELLED')
  }

  try {
    const subscription = await prisma.consumerSubscription.findUnique({
      where: { id }
    })

    if (!subscription) {
      return errorResponse(res, 404, 'Subscription not found')
    }

    if (subscription.userId !== userId) {
      return errorResponse(res, 403, 'Access denied')
    }

    const updatedData = { status }
    if (status === 'ACTIVE') {
      updatedData.nextDelivery = getNextDeliveryDate(subscription.frequency)
    }

    const updatedSubscription = await prisma.consumerSubscription.update({
      where: { id },
      data: updatedData
    })

    logger.info('Subscription status updated', { subscriptionId: id, status })
    return successResponse(res, 200, updatedSubscription, `Subscription status updated to ${status}`)
  } catch (error) {
    logger.error('Error updating subscription status', { subscriptionId: id, error: error.message })
    return errorResponse(res, 500, 'Failed to update subscription status')
  }
})
