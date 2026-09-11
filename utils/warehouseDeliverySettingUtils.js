/**
 * Consumer-side read of WarehouseDeliverySetting.
 * Used to align delivery types and charges with Partner configuration.
 * When no warehouse row exists, falls back to MasterDeliverySetting (same defaults as Partner).
 */
import { prisma } from '../config/prismaClient.js'
import logger from './logger.js'

const DEFAULT_EXPRESS_CHARGE = 20
const DEFAULT_SCHEDULED_CHARGE = 10
const FREE_DELIVERY_THRESHOLD = 500

/**
 * Build effective setting shape from MasterDeliverySetting rows (FAST, SCHEDULED, PICKUP_STORE).
 * @private
 */
function buildEffectiveFromMaster(masterRows) {
  let expressEnabled = true
  let scheduledEnabled = true
  let selfPickupEnabled = false
  let defaultCharge = DEFAULT_EXPRESS_CHARGE
  let scheduledCharge = DEFAULT_SCHEDULED_CHARGE
  for (const m of masterRows) {
    const charge = m.defaultCharge != null ? Number(m.defaultCharge) : 0
    if (m.type === 'FAST') {
      expressEnabled = Boolean(m.isEnabledByDefault)
      defaultCharge = charge
    } else if (m.type === 'SCHEDULED') {
      scheduledEnabled = Boolean(m.isEnabledByDefault)
      scheduledCharge = charge
    } else if (m.type === 'PICKUP_STORE') {
      selfPickupEnabled = Boolean(m.isEnabledByDefault)
    }
  }
  return {
    expressEnabled,
    scheduledEnabled,
    selfPickupEnabled,
    defaultCharge,
    scheduledCharge: scheduledCharge ?? defaultCharge,
  }
}

/**
 * Get effective delivery setting for a warehouse (for Consumer use).
 * Uses WarehouseDeliverySetting when present; otherwise MasterDeliverySetting (aligns with Partner defaults).
 * @param {string} warehouseId
 * @returns {Promise<{ expressEnabled: boolean, scheduledEnabled: boolean, selfPickupEnabled: boolean, defaultCharge: number, scheduledCharge: number } | null>}
 *   Null only when warehouseId is invalid or DB error.
 */
export async function getWarehouseDeliverySetting(warehouseId) {
  if (!warehouseId || !String(warehouseId).trim()) return null
  try {
    const row = await prisma.warehouseDeliverySetting.findUnique({
      where: { warehouseId },
      select: {
        expressSettingsEnabled: true,
        scheduledDeliveryEnabled: true,
        selfPickupEnabled: true,
        defaultDeliveryCharge: true,
        expressDeliveryCharge: true,
        scheduledDeliveryCharge: true,
      },
    })
    if (row) {
      const defaultCharge =
        row.defaultDeliveryCharge != null ? Number(row.defaultDeliveryCharge) : DEFAULT_EXPRESS_CHARGE
      const expressCharge =
        row.expressDeliveryCharge != null ? Number(row.expressDeliveryCharge) : defaultCharge
      const scheduledCharge =
        row.scheduledDeliveryCharge != null ? Number(row.scheduledDeliveryCharge) : defaultCharge
      return {
        expressEnabled: Boolean(row.expressSettingsEnabled),
        scheduledEnabled: Boolean(row.scheduledDeliveryEnabled),
        selfPickupEnabled: Boolean(row.selfPickupEnabled),
        defaultCharge: expressCharge,
        scheduledCharge,
      }
    }
    const masterRows = await prisma.masterDeliverySetting.findMany({
      orderBy: { displayOrder: 'asc' },
      select: { type: true, isEnabledByDefault: true, defaultCharge: true },
    })
    if (masterRows.length > 0) return buildEffectiveFromMaster(masterRows)
    return buildEffectiveFromMaster([])
  } catch (error) {
    logger.warn('[WarehouseDeliverySetting] Error fetching', {
      warehouseId,
      error: error.message,
    })
    return null
  }
}

/**
 * Check if a delivery type is enabled for the warehouse.
 * Uses WarehouseDeliverySetting when present, else MasterDeliverySetting; if neither, allows all (fallback).
 * @param {string} warehouseId
 * @param {string} deliveryType - FAST | SCHEDULED | PICKUP_STORE
 * @returns {Promise<boolean>}
 */
export async function isDeliveryTypeEnabled(warehouseId, deliveryType) {
  const setting = await getWarehouseDeliverySetting(warehouseId)
  if (!setting) return true
  if (deliveryType === 'FAST') return setting.expressEnabled
  if (deliveryType === 'SCHEDULED') return setting.scheduledEnabled
  if (deliveryType === 'PICKUP_STORE') return setting.selfPickupEnabled
  return false
}

/**
 * Get delivery charge by type from WarehouseDeliverySetting, with fallback.
 * Free delivery threshold (orderValue >= 500 → 0) applies to scheduled home delivery only;
 * FAST (express) always uses the express charge when selected (not waived by threshold).
 * @param {string} warehouseId
 * @param {string} deliveryType - FAST | SCHEDULED | PICKUP_STORE
 * @param {number} orderValue
 * @returns {Promise<number>}
 */
export async function getDeliveryChargeByTypeFromWarehouse(warehouseId, deliveryType, orderValue) {
  if (deliveryType === 'PICKUP_STORE') return 0
  const setting = await getWarehouseDeliverySetting(warehouseId)
  if (!setting) {
    const fallback = deliveryType === 'FAST' ? DEFAULT_EXPRESS_CHARGE : DEFAULT_SCHEDULED_CHARGE
    return fallback
  }
  if (deliveryType === 'FAST') return setting.defaultCharge
  if (deliveryType === 'SCHEDULED') return setting.scheduledCharge
  return setting.defaultCharge
}

/**
 * Get delivery charge for order: apply DeliveryChargeRule when configured, else per-type charge.
 * Merge: rule (pincode/warehouse) overrides when present; otherwise use WarehouseDeliverySetting per-type.
 * @param {string} warehouseId
 * @param {string} deliveryType - FAST | SCHEDULED | PICKUP_STORE
 * @param {number} orderValue
 * @param {string} [pincode] - Optional; when provided, DeliveryChargeRule is checked first
 * @returns {Promise<number>}
 */
export async function getDeliveryChargeForOrder(warehouseId, deliveryType, orderValue, pincode) {
  if (deliveryType === 'PICKUP_STORE') return 0
  const { findDeliveryChargeRule } = await import('./deliveryChargeUtils.js')
  if (pincode && warehouseId) {
    const rule = await findDeliveryChargeRule(warehouseId, pincode, orderValue)
    if (rule != null && rule.charge != null) return Number(rule.charge)
  }
  return getDeliveryChargeByTypeFromWarehouse(warehouseId, deliveryType, orderValue)
}

export { DEFAULT_EXPRESS_CHARGE, DEFAULT_SCHEDULED_CHARGE, FREE_DELIVERY_THRESHOLD }
