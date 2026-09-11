// utils/orderModification.js
import { prisma } from '../config/prismaClient.js'
import logger from './logger.js'

/**
 * Create order modification history entry
 * 
 * @param {string} orderId - Order ID
 * @param {string} type - Modification type (ITEMS, ADDRESS, PAYMENT, DELIVERY_SLOT)
 * @param {Object} oldData - Previous data
 * @param {Object} newData - New data
 * @param {string} changedBy - User ID who made the change
 * @param {string} reason - Optional reason
 * @returns {Promise<Object>} Created modification entry
 */
export async function createOrderModification(
  orderId,
  type,
  oldData,
  newData,
  changedBy,
  reason = null
) {
  try {
    const modification = await prisma.orderModification.create({
      data: {
        orderId,
        type,
        oldData,
        newData,
        changedBy,
        reason
      }
    })

    logger.info('[OrderModification] Modification history created', {
      orderId,
      type,
      changedBy
    })

    return modification
  } catch (error) {
    logger.error('[OrderModification] Error creating modification history', {
      error: error.message,
      orderId,
      type
    })
    throw error
  }
}

/**
 * Get order modification history
 * 
 * @param {string} orderId - Order ID
 * @returns {Promise<Array>} Modification history entries
 */
export async function getOrderModifications(orderId) {
  try {
    const modifications = await prisma.orderModification.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' }
    })

    return modifications
  } catch (error) {
    logger.error('[OrderModification] Error fetching modifications', {
      error: error.message,
      orderId
    })
    throw error
  }
}

