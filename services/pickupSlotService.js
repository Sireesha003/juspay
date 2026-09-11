/**
 * PickupSlotService – store pickup slot listing, reserve, release.
 * Responsibilities: list pickup slots for warehouse/date (from PickupSlot table or legacy JSON); book/release with capacity.
 */

import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'

/**
 * Get available pickup slots for a warehouse and date.
 * Uses PickupSlot table when rows exist; otherwise falls back to Warehouse.pickupTimeSlots JSON (no capacity).
 *
 * @param {string} warehouseId
 * @param {Date} date - date only
 * @returns {Promise<Array<{ id?: string, slot: string, startTime: string, endTime: string, time: string, available?: number, capacity?: number, booked?: number, isAvailable?: boolean, source: 'pickup_slots' | 'legacy_json' }>>}
 */
export async function getAvailablePickupSlots(warehouseId, date) {
  const d = date instanceof Date ? date : new Date(date)
  const dateOnly = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))

  const rows = await prisma.pickupSlot.findMany({
    where: {
      warehouseId,
      date: dateOnly,
      isActive: true,
    },
    orderBy: [{ startTime: 'asc' }],
  })

  if (rows.length > 0) {
    return rows.map((r) => {
      const available = r.capacity - r.booked
      return {
        id: r.id,
        slot: r.slot,
        startTime: r.startTime,
        endTime: r.endTime,
        time: `${r.startTime}-${r.endTime}`,
        available: Math.max(0, available),
        capacity: r.capacity,
        booked: r.booked,
        isAvailable: available > 0,
        source: 'pickup_slots',
      }
    })
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { pickupTimeSlots: true },
  })

  const jsonSlots = warehouse?.pickupTimeSlots
  if (Array.isArray(jsonSlots) && jsonSlots.length > 0) {
    return jsonSlots.map((s) => ({
      slot: s.slot ?? s.label ?? s.time ?? 'Slot',
      startTime: s.startTime ?? s.time?.split('-')?.[0] ?? '',
      endTime: s.endTime ?? s.time?.split('-')?.[1] ?? '',
      time: s.time ?? (s.startTime && s.endTime ? `${s.startTime}-${s.endTime}` : ''),
      source: 'legacy_json',
    }))
  }

  return []
}

/**
 * Reserve a pickup slot (atomic: booked < capacity then increment). Run inside order-creation transaction.
 *
 * @param {object} tx - Prisma transaction client
 * @param {string} pickupSlotId
 * @returns {Promise<{ id: string, booked: number, capacity: number }>}
 */
export async function reservePickupSlot(tx, pickupSlotId) {
  const result = await tx.$queryRaw`
    UPDATE "PickupSlot"
    SET "booked" = "booked" + 1
    WHERE "id" = ${pickupSlotId}
      AND "booked" < "capacity"
      AND "isActive" = true
    RETURNING id, "booked", "capacity"
  `
  const row = Array.isArray(result) ? result[0] : result
  if (!row) {
    throw new Error('Pickup slot is full or not available.')
  }
  return { id: row.id, booked: row.booked, capacity: row.capacity }
}

/**
 * Release pickup slot for an order (decrement booked). Run inside cancel/modify transaction.
 * Atomic: UPDATE ... SET booked = booked - 1 WHERE id = ? AND booked > 0 to prevent negative under concurrency.
 *
 * @param {object} tx - Prisma transaction client
 * @param {{ pickupSlotId?: string | null }} order
 */
export async function releasePickupSlot(tx, order) {
  if (!order.pickupSlotId) return
  const result = await tx.$queryRaw`
    UPDATE "PickupSlot"
    SET "booked" = "booked" - 1
    WHERE "id" = ${order.pickupSlotId}
      AND "booked" > 0
    RETURNING id, "booked"
  `
  const updated = Array.isArray(result) ? result[0] : result
  if (!updated) {
    logger.warn('[PickupSlotService] Release skipped (not found or booked already 0)', { pickupSlotId: order.pickupSlotId })
    return
  }
  logger.info('[PickupSlotService] Slot released', { pickupSlotId: order.pickupSlotId })
}

export default {
  getAvailablePickupSlots,
  reservePickupSlot,
  releasePickupSlot,
}
