/**
 * DeliveryConfigurationService – checkout delivery options.
 * Responsibilities: load delivery settings, filter enabled types, apply blackout, return options with charges.
 * Used by GET delivery types and checkout flow.
 */

import { prisma } from '../config/prismaClient.js'
import { getWarehouseDeliverySetting } from '../utils/warehouseDeliverySettingUtils.js'
import { getAvailableDeliveryTypes } from '../utils/deliveryTypeUtils.js'
import { resolveRouteMapIdsForAddress, resolveRouteMapIdsForPincode } from '../utils/deliverySlotUtils.js'
import logger from '../utils/logger.js'

/**
 * Get blackout dates for a warehouse in a date range (for slot filtering).
 * @param {string} warehouseId
 * @param {Date} fromDate - start of range (date only)
 * @param {Date} toDate - end of range (date only)
 * @returns {Promise<Set<string>>} Set of date strings (YYYY-MM-DD)
 */
export async function getBlackoutDatesForWarehouse(warehouseId, fromDate, toDate) {
  if (!warehouseId) return new Set()
  try {
    const rows = await prisma.warehouseDeliveryBlackout.findMany({
      where: {
        warehouseId,
        date: { gte: fromDate, lte: toDate },
      },
      select: { date: true },
    })
    return new Set(rows.map((r) => (r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date))))
  } catch (err) {
    logger.warn('[DeliveryConfig] getBlackoutDatesForWarehouse failed', { warehouseId, error: err?.message })
    return new Set()
  }
}

/**
 * Get available delivery options for checkout.
 * Steps: find warehouse → load settings → filter types → resolve route (if address) → optional blackout.
 *
 * @param {string} warehouseId
 * @param {Object} options - { addressId?, pincode?, cartValue? }
 * @returns {Promise<{ warehouse, options: { fast, scheduled, pickup }, routeMapIds?, blackoutDates? }>}
 */
export async function getAvailableDeliveryOptions(warehouseId, options = {}) {
  const { addressId, pincode, cartValue = 0 } = options

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: {
      id: true,
      name: true,
      location: true,
      isPickupStore: true,
      pickupTimeSlots: true,
    },
  })

  if (!warehouse) {
    return { warehouse: null, options: null }
  }

  let deliveryAddress = null
  if (addressId) {
    const addr = await prisma.address.findUnique({
      where: { id: addressId },
      select: { id: true, pincode: true, location: true, city: true, state: true },
    })
    if (addr) deliveryAddress = addr
  }

  const pincodeForRoute = deliveryAddress?.pincode ?? pincode
  let routeMapIds = null
  if (pincodeForRoute) {
    try {
      routeMapIds = await resolveRouteMapIdsForPincode(warehouseId, String(pincodeForRoute).trim())
    } catch (err) {
      logger.warn('[DeliveryConfig] resolveRouteMapIds failed', { warehouseId, pincode: pincodeForRoute, error: err?.message })
    }
  }

  const types = await getAvailableDeliveryTypes(warehouseId, deliveryAddress, cartValue)

  const fromDate = new Date()
  fromDate.setUTCHours(0, 0, 0, 0)
  const toDate = new Date(fromDate)
  toDate.setDate(toDate.getDate() + 30)
  const blackoutDates = await getBlackoutDatesForWarehouse(warehouseId, fromDate, toDate)

  return {
    warehouse,
    options: types,
    routeMapIds: routeMapIds ?? [],
    blackoutDates: Array.from(blackoutDates),
  }
}

export default {
  getAvailableDeliveryOptions,
  getBlackoutDatesForWarehouse,
}
