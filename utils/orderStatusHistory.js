// utils/orderStatusHistory.js
import { prisma } from '../config/prismaClient.js'
import logger from './logger.js'

/**
 * Create order status history entry
 * 
 * @param {string} orderId - Order ID
 * @param {string} fromStatus - Previous status
 * @param {string} toStatus - New status
 * @param {string} changedBy - User ID who changed the status
 * @param {string} reason - Optional reason for change
 * @param {string} notes - Optional notes
 * @returns {Promise<Object>} Created history entry
 */
export async function createOrderStatusHistory(
  orderId,
  fromStatus,
  toStatus,
  changedBy = null,
  reason = null,
  notes = null
) {
  try {
    const history = await prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus,
        toStatus,
        changedBy,
        reason,
        notes
      }
    })

    logger.info('[OrderStatusHistory] Status history created', {
      orderId,
      fromStatus,
      toStatus,
      changedBy
    })

    return history
  } catch (error) {
    logger.error('[OrderStatusHistory] Error creating history', {
      error: error.message,
      orderId,
      fromStatus,
      toStatus
    })
    throw error
  }
}

/**
 * Get order status history
 * 
 * @param {string} orderId - Order ID
 * @returns {Promise<Array>} Status history entries
 */
export async function getOrderStatusHistory(orderId) {
  try {
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true
          }
        }
      }
    })

    return history
  } catch (error) {
    logger.error('[OrderStatusHistory] Error fetching history', {
      error: error.message,
      orderId
    })
    throw error
  }
}

