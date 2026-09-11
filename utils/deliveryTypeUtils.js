// utils/deliveryTypeUtils.js
import { prisma } from '../config/prismaClient.js'
import { calculateDeliveryDistance, calculateFastDeliveryETA } from './distanceUtils.js'
import logger from './logger.js'
import {
  getWarehouseDeliverySetting,
  DEFAULT_EXPRESS_CHARGE,
  DEFAULT_SCHEDULED_CHARGE,
} from './warehouseDeliverySettingUtils.js'

// Fallback delivery type pricing (when WarehouseDeliverySetting does not exist)
const DELIVERY_TYPE_PRICES = {
  FAST: DEFAULT_EXPRESS_CHARGE,
  SCHEDULED: DEFAULT_SCHEDULED_CHARGE,
  PICKUP_STORE: 0,
}

/**
 * Get available delivery types with pricing and details.
 * Respects WarehouseDeliverySetting when present; else MasterDeliverySetting (same defaults as Partner).
 * If neither available (e.g. DB error), falls back to all types with hardcoded charges.
 *
 * @param {string} warehouseId - Warehouse ID
 * @param {Object} deliveryAddress - Delivery address with location
 * @param {number} orderValue - Order value (for free delivery check)
 * @returns {Promise<Object>} Available delivery types (fast, scheduled, pickup)
 */
export async function getAvailableDeliveryTypes(warehouseId, deliveryAddress, orderValue = 0) {
  try {
    const [warehouse, setting] = await Promise.all([
      prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: {
          id: true,
          name: true,
          location: true,
          isPickupStore: true,
          pickupTimeSlots: true,
        },
      }),
      getWarehouseDeliverySetting(warehouseId),
    ])

    if (!warehouse) {
      logger.warn('[DeliveryType] Warehouse not found', { warehouseId })
      return {
        fast: { available: false },
        scheduled: { available: false },
        pickup: { available: false },
      }
    }

    // When no setting: fallback – all types available, hardcoded charges
    const expressEnabled = setting ? setting.expressEnabled : true
    const scheduledEnabled = setting ? setting.scheduledEnabled : true
    const selfPickupEnabled = setting ? setting.selfPickupEnabled : true

    const fastCharge =
      setting != null ? setting.defaultCharge : DELIVERY_TYPE_PRICES.FAST
    const scheduledCharge =
      setting != null ? setting.scheduledCharge : DELIVERY_TYPE_PRICES.SCHEDULED

    let distance = null
    let fastDeliveryETA = null
    if (deliveryAddress?.location && warehouse.location) {
      distance = calculateDeliveryDistance(warehouse.location, deliveryAddress.location)
      if (distance != null) fastDeliveryETA = calculateFastDeliveryETA(distance)
    }

    const pickupAvailable = Boolean(warehouse.isPickupStore && selfPickupEnabled)

    return {
      fast: {
        available: expressEnabled,
        charge: fastCharge,
        originalCharge: fastCharge,
        eta: fastDeliveryETA?.display ?? null,
        minTime: fastDeliveryETA?.min ?? null,
        maxTime: fastDeliveryETA?.max ?? null,
        distance,
        label: 'Fast Delivery',
        description: fastDeliveryETA
          ? `Will be deliver in ${fastDeliveryETA.display}`
          : 'Will be deliver in 15 - 20 min',
      },
      scheduled: {
        available: scheduledEnabled,
        charge: scheduledCharge,
        originalCharge: scheduledCharge,
        distance,
        label: 'Scheduled Delivery',
        description: 'Choose your convenient slot',
        slotsAvailable: true,
      },
      pickup: {
        available: pickupAvailable,
        charge: 0,
        distance: null,
        label: 'Pickup at Store',
        description: 'Pick-up on way at store',
        storesCount: pickupAvailable ? 1 : 0,
        store: pickupAvailable
          ? { id: warehouse.id, name: warehouse.name }
          : null,
      },
    }
  } catch (error) {
    logger.error('[DeliveryType] Error getting delivery types', {
      error: error.message,
      warehouseId,
      stack: error.stack,
    })
    return {
      fast: { available: false },
      scheduled: { available: false },
      pickup: { available: false },
    }
  }
}

/**
 * Calculate delivery charge based on delivery type (uses WarehouseDeliverySetting when present).
 *
 * @param {string} deliveryType - FAST, SCHEDULED, or PICKUP_STORE
 * @param {number} orderValue - Order value
 * @param {string} warehouseId - Warehouse ID
 * @param {string} pincode - Delivery pincode (unused; kept for API compatibility)
 * @param {number} distance - Distance in km (optional, unused)
 * @returns {Promise<number>} Delivery charge
 */
export async function calculateDeliveryChargeByType(
  deliveryType,
  orderValue,
  warehouseId,
  pincode,
  distance = null
) {
  const { getDeliveryChargeByTypeFromWarehouse } = await import(
    './warehouseDeliverySettingUtils.js'
  )
  return getDeliveryChargeByTypeFromWarehouse(warehouseId, deliveryType, orderValue)
}

/**
 * Get pickup stores for a warehouse/area
 * 
 * @param {string} warehouseId - Optional warehouse ID to filter
 * @param {string} pincode - Optional pincode to find nearby stores
 * @returns {Promise<Array>} List of pickup stores
 */
export async function getPickupStores(warehouseId = null, pincode = null) {
  try {
    const where = {
      isPickupStore: true,
      isActive: true
    }

    if (warehouseId) {
      where.id = warehouseId
    }

    if (pincode) {
      where.servicePincodes = {
        has: pincode
      }
    }

    const stores = await prisma.warehouse.findMany({
      where,
      select: {
        id: true,
        name: true,
        address: true,
        location: true,
        phone: true,
        opensAt: true,
        closesAt: true,
        pickupTimeSlots: true
      }
    })

    return stores.map(store => ({
      id: store.id,
      name: store.name,
      address: store.address,
      location: store.location,
      phone: store.phone,
      opensAt: store.opensAt,
      closesAt: store.closesAt,
      pickupTimeSlots: store.pickupTimeSlots
    }))
  } catch (error) {
    logger.error('[DeliveryType] Error getting pickup stores', {
      error: error.message,
      warehouseId,
      pincode
    })
    return []
  }
}

