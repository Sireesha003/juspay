// utils/salesUtils.js
import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'

/**
 * Create sales records when order is delivered
 * This should be called when order status changes to DELIVERED
 */
export async function createSalesRecords(orderId) {
  try {
    logger.info('[Sales] Creating sales records for order', { orderId })

    // Get order with items and warehouse
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                price: true
              }
            }
          }
        },
        warehouse: {
          select: {
            id: true
          }
        }
      }
    })

    if (!order) {
      logger.error('[Sales] Order not found', { orderId })
      return { success: false, error: 'Order not found' }
    }

    if (order.status !== 'DELIVERED') {
      logger.warn('[Sales] Order is not delivered, skipping sales record creation', {
        orderId,
        status: order.status
      })
      return { success: false, error: 'Order is not delivered' }
    }

    if (!order.warehouseId || !order.warehouse) {
      logger.error('[Sales] Order warehouse not found', { orderId })
      return { success: false, error: 'Order warehouse not found' }
    }

    // Check if sales records already exist for this order
    const existingSales = await prisma.sales.findFirst({
      where: { orderId }
    })

    if (existingSales) {
      logger.info('[Sales] Sales records already exist for order', { orderId })
      return { success: true, message: 'Sales records already exist' }
    }

    // Create sales records for each order item
    const salesRecords = []
    for (const item of order.items) {
      const salesRecord = await prisma.sales.create({
        data: {
          orderId: order.id,
          productId: item.productId,
          userId: order.consumerId,
          warehouseId: order.warehouseId,
          quantity: item.quantity,
          total: item.totalPrice
        }
      })
      salesRecords.push(salesRecord)
    }

    logger.info('[Sales] Sales records created successfully', {
      orderId,
      recordsCount: salesRecords.length
    })

    return { success: true, records: salesRecords }
  } catch (error) {
    logger.error('[Sales] Error creating sales records', {
      error: error.message,
      orderId,
      stack: error.stack
    })
    return { success: false, error: error.message }
  }
}

/**
 * Delete sales records when order is cancelled or returned
 * This should be called when order status changes from DELIVERED to CANCELLED
 * or when a return is processed
 */
export async function deleteSalesRecords(orderId) {
  try {
    logger.info('[Sales] Deleting sales records for order', { orderId })

    const result = await prisma.sales.deleteMany({
      where: { orderId }
    })

    logger.info('[Sales] Sales records deleted', {
      orderId,
      deletedCount: result.count
    })

    return { success: true, deletedCount: result.count }
  } catch (error) {
    logger.error('[Sales] Error deleting sales records', {
      error: error.message,
      orderId,
      stack: error.stack
    })
    return { success: false, error: error.message }
  }
}

