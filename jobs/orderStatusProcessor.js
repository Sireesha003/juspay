// jobs/orderStatusProcessor.js
// Redis/Bull removed - jobs now execute synchronously
import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'
import { validateStatusTransition } from '../utils/orderStatusUtils.js'
import { orchestratePostStatusPersist } from '../services/orchestration/orderLifecycleOrchestrator.js'

/**
 * Process order status change synchronously
 * This function replaces the async queue processing
 */
async function processOrderStatusChange(orderId, fromStatus, toStatus, changedBy = null) {
  logger.info('[OrderStatusJob] Processing order status change', {
    orderId,
    fromStatus,
    toStatus,
    changedBy
  })

  try {
    // Fetch order with relations
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        consumer: {
          select: {
            id: true,
            name: true,
            phone: true
          }
        },
        address: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        payment: true,
        delivery: {
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                phone: true
              }
            }
          }
        }
      }
    })

    if (!order) {
      logger.warn('[OrderStatusJob] Order not found', { orderId })
      return { success: false, error: 'Order not found' }
    }

    // Validate status transition
    const validation = validateStatusTransition(fromStatus, toStatus)
    if (!validation.valid) {
      logger.warn('[OrderStatusJob] Invalid status transition', {
        orderId,
        fromStatus,
        toStatus,
        error: validation.error
      })
      return { success: false, error: validation.error }
    }

    // Realtime + push via orchestrator (history already created by handleOrderStatusChange)
    try {
      await orchestratePostStatusPersist({
        orderId,
        status: toStatus,
        previousStatus: fromStatus,
        eventId: null,
        source: 'CONSUMER_ORDER_STATUS',
        changedBy,
        recordStatusHistory: false,
        cancellationReason: null,
        extraSocketPayload: {
          orderNumber: order.orderNumber,
          fromStatus,
          changedBy
        }
      })
      logger.info('[OrderStatusJob] Orchestrated realtime + notification enqueue', {
        orderId,
        userId: order.consumerId,
        status: toStatus
      })
    } catch (error) {
      logger.error('[OrderStatusJob] orchestratePostStatusPersist failed', {
        orderId,
        error: error.message
      })
    }

    return {
      success: true,
      orderId,
      status: toStatus
    }
  } catch (error) {
    logger.error('[OrderStatusJob] Error processing status change', {
      orderId,
      error: error.message,
      stack: error.stack
    })
    throw error
  }
}

/**
 * Queue order status change (now executes synchronously)
 * This function maintains the same interface but executes immediately
 */
export async function queueOrderStatusChange(orderId, fromStatus, toStatus, changedBy = null) {
  try {
    // Execute synchronously instead of queuing
    const result = await processOrderStatusChange(orderId, fromStatus, toStatus, changedBy)
    
    logger.debug('[OrderStatusJob] Status change processed', {
      orderId,
      fromStatus,
      toStatus,
      success: result.success
    })

    return { id: 'sync-execution', result }
  } catch (error) {
    logger.error('[OrderStatusJob] Error processing status change', {
      orderId,
      error: error.message
    })
    // Don't throw - allow order update to succeed even if notification fails
    return null
  }
}

// Order push notifications: in-process dispatch on consumer-api (setImmediate); see queues/orderNotificationQueue.js
logger.info('[OrderStatusJob] Realtime + notification side-effects wired (single-node in-process FCM dispatch)')

export default {
  queueOrderStatusChange
}
