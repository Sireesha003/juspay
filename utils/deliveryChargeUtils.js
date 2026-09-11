// utils/deliveryChargeUtils.js
import { prisma } from '../config/prismaClient.js'
import logger from './logger.js'

const DEFAULT_FREE_DELIVERY_THRESHOLD = 500
const DEFAULT_DELIVERY_CHARGE = 50

/**
 * Calculate delivery charge based on order value, pincode, and warehouse
 * 
 * @param {number} orderValue - Order value (after tax)
 * @param {string} warehouseId - Warehouse ID
 * @param {string} pincode - Delivery pincode
 * @returns {Promise<number>} Delivery charge
 */
export async function calculateDeliveryCharge(orderValue, warehouseId, pincode) {
  try {
    // First, try to find matching delivery charge rule
    if (warehouseId && pincode) {
      const rule = await findDeliveryChargeRule(warehouseId, pincode, orderValue)
      
      if (rule) {
        logger.info('[DeliveryCharge] Using rule-based charge', {
          warehouseId,
          pincode,
          orderValue,
          charge: rule.charge,
          ruleId: rule.id
        })
        return rule.charge
      }
    }

    // Fallback to default logic
    if (warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: {
          id: true,
          // Add delivery charge fields if they exist in schema
        }
      })

      if (warehouse) {
        // Use warehouse-specific rules if available
        // For now, use defaults
      }
    }

    // Default logic: Free delivery above threshold, fixed charge below
    const charge = orderValue >= DEFAULT_FREE_DELIVERY_THRESHOLD 
      ? 0 
      : DEFAULT_DELIVERY_CHARGE

    logger.debug('[DeliveryCharge] Using default charge', {
      orderValue,
      threshold: DEFAULT_FREE_DELIVERY_THRESHOLD,
      charge
    })

    return charge
  } catch (error) {
    logger.error('[DeliveryCharge] Error calculating charge', {
      error: error.message,
      orderValue,
      warehouseId,
      pincode
    })
    // Return default charge on error
    return orderValue >= DEFAULT_FREE_DELIVERY_THRESHOLD ? 0 : DEFAULT_DELIVERY_CHARGE
  }
}

/**
 * Find matching delivery charge rule (exported for use with per-type charge merge).
 *
 * @param {string} warehouseId - Warehouse ID
 * @param {string} pincode - Delivery pincode
 * @param {number} orderValue - Order value
 * @returns {Promise<Object|null>} Matching rule or null
 */
export async function findDeliveryChargeRule(warehouseId, pincode, orderValue) {
  try {
    // First, try to find pincode-specific rule
    const pincodeRule = await prisma.deliveryChargeRule.findFirst({
      where: {
        warehouseId,
        pincode,
        isActive: true,
        OR: [
          { minOrderValue: null },
          { minOrderValue: { lte: orderValue } }
        ],
        AND: [
          {
            OR: [
              { maxOrderValue: null },
              { maxOrderValue: { gte: orderValue } }
            ]
          }
        ]
      },
      orderBy: {
        minOrderValue: 'desc' // Prefer rules with higher min order value
      }
    })

    if (pincodeRule) {
      return pincodeRule
    }

    // If no pincode-specific rule, try warehouse-level rule
    const warehouseRule = await prisma.deliveryChargeRule.findFirst({
      where: {
        warehouseId,
        pincode: null,
        isActive: true,
        OR: [
          { minOrderValue: null },
          { minOrderValue: { lte: orderValue } }
        ],
        AND: [
          {
            OR: [
              { maxOrderValue: null },
              { maxOrderValue: { gte: orderValue } }
            ]
          }
        ]
      },
      orderBy: {
        minOrderValue: 'desc'
      }
    })

    return warehouseRule
  } catch (error) {
    logger.error('[DeliveryCharge] Error finding rule', {
      error: error.message,
      warehouseId,
      pincode,
    })
    return null
  }
}

/**
 * Check if delivery is free for given order value
 * 
 * @param {number} orderValue - Order value
 * @param {string} warehouseId - Warehouse ID
 * @param {string} pincode - Delivery pincode
 * @returns {Promise<boolean>} True if free delivery
 */
export async function isFreeDelivery(orderValue, warehouseId, pincode) {
  const charge = await calculateDeliveryCharge(orderValue, warehouseId, pincode)
  return charge === 0
}

/**
 * Get delivery charge for cart summary
 * This is an estimate and may change during checkout
 * 
 * @param {number} cartValue - Cart value (after tax)
 * @param {string} warehouseId - Warehouse ID
 * @param {string} pincode - Optional delivery pincode
 * @returns {Promise<number>} Estimated delivery charge
 */
export async function getCartDeliveryCharge(cartValue, warehouseId, pincode = null) {
  return calculateDeliveryCharge(cartValue, warehouseId, pincode)
}

