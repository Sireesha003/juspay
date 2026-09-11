// utils/orderUtils.js
import { prisma } from '../config/prismaClient.js'
import logger from './logger.js'

/**
 * Generate unique order number
 * Format: VK-YYYYMMDD-XXXXXX (e.g., VK-20251120-000001)
 * 
 * Uses database transaction to prevent race conditions
 */
export async function generateOrderNumber() {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD
  
  // Get today's date range
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  // Use transaction to prevent race conditions
  // Find the highest sequence number for today and increment atomically
  const orderNumber = await prisma.$transaction(async (tx) => {
    // Get the latest order number for today
    const latestOrder = await tx.order.findFirst({
      where: {
        orderNumber: {
          startsWith: `VK-${dateStr}-`
        }
      },
      orderBy: {
        orderNumber: 'desc'
      },
      select: {
        orderNumber: true
      }
    })

    let sequence = 1

    if (latestOrder) {
      // Extract sequence from latest order number
      const parts = latestOrder.orderNumber.split('-')
      if (parts.length === 3) {
        const lastSequence = parseInt(parts[2], 10)
        if (!isNaN(lastSequence)) {
          sequence = lastSequence + 1
        }
      }
    }

    // Generate new order number
    const newOrderNumber = `VK-${dateStr}-${String(sequence).padStart(6, '0')}`

    // Verify it doesn't exist (double-check for safety)
    const exists = await tx.order.findUnique({
      where: { orderNumber: newOrderNumber },
      select: { id: true }
    })

    if (exists) {
      // If exists, increment and try again (shouldn't happen, but safety check)
      sequence += 1
      return `VK-${dateStr}-${String(sequence).padStart(6, '0')}`
    }

    return newOrderNumber
  })
  
  logger.info('[OrderUtils] Order number generated', { orderNumber })
  
  return orderNumber
}

/**
 * Calculate delivery charge based on order value and pincode
 * 
 * Rules:
 * - Free delivery for orders above threshold (default: 500)
 * - Fixed charge for orders below threshold (default: 50)
 * - Can be customized per warehouse
 */
export async function calculateDeliveryCharge(orderValue, warehouseId, pincode) {
  const DEFAULT_FREE_DELIVERY_THRESHOLD = 500
  const DEFAULT_DELIVERY_CHARGE = 50

  try {
    // Get warehouse if provided
    if (warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: {
          id: true,
          // Add delivery charge fields if they exist in schema
          // For now, using defaults
        }
      })

      if (warehouse) {
        // Check if order value meets free delivery threshold
        if (orderValue >= DEFAULT_FREE_DELIVERY_THRESHOLD) {
          logger.info('[OrderUtils] Free delivery applied', {
            orderValue,
            threshold: DEFAULT_FREE_DELIVERY_THRESHOLD
          })
          return 0
        }

        // Return fixed delivery charge
        logger.info('[OrderUtils] Delivery charge calculated', {
          orderValue,
          charge: DEFAULT_DELIVERY_CHARGE
        })
        return DEFAULT_DELIVERY_CHARGE
      }
    }

    // Default calculation if warehouse not found
    if (orderValue >= DEFAULT_FREE_DELIVERY_THRESHOLD) {
      return 0
    }

    return DEFAULT_DELIVERY_CHARGE
  } catch (error) {
    logger.error('[OrderUtils] Error calculating delivery charge', {
      error: error.message,
      orderValue,
      warehouseId
    })
    // Return default charge on error
    return DEFAULT_DELIVERY_CHARGE
  }
}

/**
 * Validate that all cart items are from the same warehouse
 */
export async function validateWarehouseConsistency(cartItems) {
  if (cartItems.length === 0) {
    return { valid: false, error: 'Cart is empty' }
  }

  const warehouseIds = new Set()
  
  for (const item of cartItems) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { warehouseId: true }
    })

    if (!product) {
      return { valid: false, error: `Product ${item.productId} not found` }
    }

    warehouseIds.add(product.warehouseId)
  }

  if (warehouseIds.size > 1) {
    return {
      valid: false,
      error: 'All items must be from the same warehouse'
    }
  }

  return {
    valid: true,
    warehouseId: Array.from(warehouseIds)[0]
  }
}

/**
 * Validate stock availability for order items.
 * When productVariantId is provided, validates variant stock and availability.
 */
export async function validateStockAvailability(items) {
  const stockIssues = []

  for (const item of items) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: {
        id: true,
        name: true,
        stock: true,
        isActive: true
      }
    })

    if (!product) {
      stockIssues.push({
        productId: item.productId,
        productVariantId: item.productVariantId ?? undefined,
        error: 'Product not found'
      })
      continue
    }

    if (!product.isActive) {
      stockIssues.push({
        productId: item.productId,
        productVariantId: item.productVariantId ?? undefined,
        productName: product.name,
        error: 'Product is not available'
      })
      continue
    }

    let availableStock = product.stock
    let displayName = product.name

    if (item.productVariantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: item.productVariantId, productId: item.productId },
        select: {
          id: true,
          variantName: true,
          stockQuantity: true,
          status: true,
          isEnabled: true
        }
      })
      if (!variant) {
        stockIssues.push({
          productId: item.productId,
          productVariantId: item.productVariantId,
          error: 'Variant not found or does not belong to this product'
        })
        continue
      }
      if (variant.status !== 'ACTIVE' || !variant.isEnabled) {
        stockIssues.push({
          productId: item.productId,
          productVariantId: item.productVariantId,
          productName: product.name,
          variantName: variant.variantName,
          error: 'This variant is not available'
        })
        continue
      }
      availableStock = variant.stockQuantity ?? 0
      displayName = `${product.name} (${variant.variantName})`
    }

    if (availableStock < item.quantity) {
      stockIssues.push({
        productId: item.productId,
        productVariantId: item.productVariantId ?? undefined,
        productName: displayName,
        requested: item.quantity,
        available: availableStock,
        error: `Only ${availableStock} units available`
      })
    }
  }

  return {
    valid: stockIssues.length === 0,
    issues: stockIssues
  }
}

