/**
 * DeliverySlotService – scheduled delivery slot listing, reserve, release.
 * Responsibilities: resolve route from address/pincode; list slots with capacity; reserve in tx; release by slotId or fallback.
 */

import {
  getAvailableSlots,
  bookDeliverySlotWithTx,
  releaseDeliverySlotByIdWithTx,
  releaseDeliverySlotWithTxRetry,
  resolveRouteMapIdsForAddress,
  resolveRouteMapIdsForPincode,
} from '../utils/deliverySlotUtils.js'
import { toUTCDateOnly } from '../utils/dateUtils.js'
import logger from '../utils/logger.js'

/**
 * Get available delivery slots for a date, optionally scoped by address or pincode (route).
 *
 * @param {string} warehouseId
 * @param {Date} date
 * @param {{ addressId?: string, pincode?: string, routeMapIds?: string[] }} options
 * @returns {Promise<Array>} Slots with id, slot, startTime, endTime, available, capacity, booked, routeMapId?, routeArea?
 */
export async function getAvailableSlotsForDate(warehouseId, date, options = {}) {
  const { addressId, pincode, routeMapIds: explicitRouteMapIds } = options

  let routeMapIds = explicitRouteMapIds
  if (!routeMapIds && (addressId || pincode)) {
    if (addressId) {
      routeMapIds = await resolveRouteMapIdsForAddress(warehouseId, addressId)
    } else if (pincode) {
      routeMapIds = await resolveRouteMapIdsForPincode(warehouseId, String(pincode).trim())
    }
  }

  return getAvailableSlots(warehouseId, date, { routeMapIds })
}

/**
 * Reserve a delivery slot inside a transaction (atomic: booked < capacity then increment).
 *
 * @param {object} tx - Prisma transaction client
 * @param {string} warehouseId
 * @param {Date} date - delivery date (date only)
 * @param {string} slotKey - e.g. "09:00-12:00" or "MORNING"
 * @param {string|null} [routeMapId]
 * @returns {Promise<{ id: string, booked: number, capacity: number }>}
 */
export async function reserveSlot(tx, warehouseId, date, slotKey, routeMapId = null) {
  const deliveryDate = toUTCDateOnly(date)
  if (!deliveryDate) throw new Error('Invalid delivery date')
  const row = await bookDeliverySlotWithTx(tx, warehouseId, deliveryDate, slotKey, routeMapId)
  return { id: row.id, booked: row.booked, capacity: row.capacity }
}

/**
 * Release delivery slot for an order. Prefers order.deliverySlotId; fallback (warehouseId, date, deliverySlot, routeMapId).
 *
 * @param {object} tx - Prisma transaction client
 * @param {{ deliverySlotId?: string | null, warehouseId?: string | null, deliveryDate?: Date | null, deliverySlot?: string | null, routeMapId?: string | null, deliveryType?: string }} order
 * @returns {Promise<{ released: boolean, error?: string }>}
 */
export async function releaseSlot(tx, order) {
  if (order.deliveryType !== 'SCHEDULED') return { released: true }
  if (!order.warehouseId || !order.deliveryDate || !order.deliverySlot) return { released: true }

  if (order.deliverySlotId) {
    try {
      await releaseDeliverySlotByIdWithTx(tx, order.deliverySlotId)
      return { released: true }
    } catch (err) {
      logger.warn('[DeliverySlotService] Release by id failed', { deliverySlotId: order.deliverySlotId, error: err?.message })
      return { released: false, error: err?.message }
    }
  }

  return releaseDeliverySlotWithTxRetry(
    tx,
    order.warehouseId,
    order.deliveryDate,
    order.deliverySlot,
    order.routeMapId
  )
}

export default {
  getAvailableSlotsForDate,
  reserveSlot,
  releaseSlot,
}
