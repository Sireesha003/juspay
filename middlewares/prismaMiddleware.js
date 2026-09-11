// middlewares/prismaMiddleware.js
import { queueOrderStatusChange } from '../jobs/orderStatusProcessor.js'
import { createOrderStatusHistory } from '../utils/orderStatusHistory.js'
import logger from '../utils/logger.js'

/**
 * Prisma middleware to automatically trigger jobs on order status changes
 * Note: Prisma 6.x doesn't support $use, so we handle this in controllers directly
 * This function is kept for backward compatibility but does nothing
 * The actual logic is handled in order controllers
 */
export function setupPrismaMiddleware() {
  // Prisma 6.x removed $use middleware
  // Instead, we handle order status changes directly in the controllers
  // This function is kept for compatibility but middleware logic is in controllers
  logger.info('[PrismaMiddleware] Middleware setup skipped (Prisma 6.x uses controller-level handling)')
}

/**
 * Handle order status change logic (called from controllers)
 * This replaces the old $use middleware functionality
 */
export async function handleOrderStatusChange(orderId, oldStatus, newStatus, changedBy = null, cancellationReason = null) {
  try {
    if (oldStatus === newStatus) {
      return // No change
    }

    // Create status history entry
    createOrderStatusHistory(
      orderId,
      oldStatus,
      newStatus,
      changedBy,
      cancellationReason,
      null
    ).catch((error) => {
      logger.error('[PrismaMiddleware] Error creating status history', {
        orderId,
        error: error.message
      })
    })

    // Queue job asynchronously (don't wait for it)
    queueOrderStatusChange(
      orderId,
      oldStatus,
      newStatus,
      changedBy
    ).catch((error) => {
      logger.error('[PrismaMiddleware] Error queueing status change job', {
        orderId,
        error: error.message
      })
    })
  } catch (error) {
    // Don't fail the update if job queueing fails
    logger.error('[PrismaMiddleware] Error handling status change', {
      error: error.message,
      orderId
    })
  }
}

