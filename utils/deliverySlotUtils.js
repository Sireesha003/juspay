// utils/deliverySlotUtils.js
import { prisma } from '../config/prismaClient.js'
import logger from './logger.js'
import { toUTCDateOnly } from './dateUtils.js'

const SLOT_TYPES = ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT']
const DEFAULT_SLOT_CAPACITY = 10

/** Display time range for slot labels (MORNING, AFTERNOON, etc.) when DB stores label only */
const SLOT_LABEL_TO_TIME = {
  MORNING: { startTime: '06:00', endTime: '12:00' },
  AFTERNOON: { startTime: '12:00', endTime: '16:00' },
  EVENING: { startTime: '16:00', endTime: '20:00' },
  NIGHT: { startTime: '20:00', endTime: '22:00' },
}

/**
 * Format time slot for display (e.g., "6:00 AM to 8:00 AM")
 * Expects HH:MM format; returns null for non-time strings (e.g. "MORNING") to avoid NaN.
 *
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format
 * @returns {string|null} Formatted time string or null if inputs are not valid times
 */
export function formatTimeSlot(startTime, endTime) {
  if (!startTime || !endTime) {
    return null
  }

  const formatTime = (timeStr) => {
    if (!/^\d{1,2}:\d{2}$/.test(String(timeStr).trim())) return null
    const [hours, minutes] = String(timeStr).trim().split(':')
    const hour = parseInt(hours, 10)
    const min = parseInt(minutes, 10)
    if (Number.isNaN(hour) || Number.isNaN(min) || hour < 0 || hour > 23 || min < 0 || min > 59) return null
    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour)
    const displayMin = min === 0 ? '' : `:${String(min).padStart(2, '0')}`
    return `${displayHour}${displayMin} ${period}`
  }

  const start = formatTime(startTime)
  const end = formatTime(endTime)
  if (start == null || end == null) return null
  return `${start} to ${end}`
}

/**
 * Check delivery slot availability
 * 
 * @param {string} warehouseId - Warehouse ID
 * @param {Date} date - Delivery date
 * @param {string} slot - Slot type (MORNING, AFTERNOON, EVENING, NIGHT)
 * @returns {Promise<Object>} Availability information
 */
export async function checkSlotAvailability(warehouseId, date, slot) {
  try {
    const deliveryDate = toUTCDateOnly(date)
    if (!deliveryDate) {
      return {
        available: DEFAULT_SLOT_CAPACITY,
        capacity: DEFAULT_SLOT_CAPACITY,
        booked: 0,
        isAvailable: true,
        slotId: null,
      }
    }

    // Find or create slot
    let deliverySlot = await prisma.deliverySlot.findFirst({
      where: {
        warehouseId,
        date: deliveryDate,
        slot,
        routeMapId: null
      }
    })

    if (!deliverySlot) {
      // Create slot with default capacity
      deliverySlot = await prisma.deliverySlot.create({
        data: {
          warehouseId,
          date: deliveryDate,
          slot,
          capacity: DEFAULT_SLOT_CAPACITY,
          booked: 0,
          isActive: true
        }
      })
    }

    const available = deliverySlot.capacity - deliverySlot.booked
    const isAvailable = available > 0 && deliverySlot.isActive

    return {
      available,
      capacity: deliverySlot.capacity,
      booked: deliverySlot.booked,
      isAvailable,
      slotId: deliverySlot.id
    }
  } catch (error) {
    logger.error('[DeliverySlot] Error checking availability', {
      error: error.message,
      warehouseId,
      date,
      slot
    })
    // Return default availability on error
    return {
      available: DEFAULT_SLOT_CAPACITY,
      capacity: DEFAULT_SLOT_CAPACITY,
      booked: 0,
      isAvailable: true,
      slotId: null
    }
  }
}

/**
 * Book delivery slot
 * 
 * @param {string} warehouseId - Warehouse ID
 * @param {Date} date - Delivery date
 * @param {string} slot - Slot type
 * @returns {Promise<Object>} Booked slot information
 */
export async function bookDeliverySlot(warehouseId, date, slot) {
  try {
    const deliveryDate = toUTCDateOnly(date)
    if (!deliveryDate) throw new Error('Invalid delivery date')

    // Check availability first
    const availability = await checkSlotAvailability(warehouseId, deliveryDate, slot)
    
    if (!availability.isAvailable) {
      throw new Error(`Slot ${slot} is not available for ${deliveryDate.toISOString()}`)
    }

    // Increment booked count
    const deliverySlot = await prisma.deliverySlot.update({
      where: {
        warehouseId_date_slot_routeMapId: {
          warehouseId,
          date: deliveryDate,
          slot,
          routeMapId: null
        }
      },
      data: {
        booked: {
          increment: 1
        }
      }
    })

    logger.info('[DeliverySlot] Slot booked', {
      warehouseId,
      date: deliveryDate,
      slot,
      booked: deliverySlot.booked,
      capacity: deliverySlot.capacity
    })

    return deliverySlot
  } catch (error) {
    logger.error('[DeliverySlot] Error booking slot', {
      error: error.message,
      warehouseId,
      date,
      slot
    })
    throw error
  }
}

/**
 * Book delivery slot inside a Prisma transaction (for order creation).
 * Uses tx for all DB operations so slot booking and order create are atomic.
 *
 * @param {object} tx - Prisma transaction client
 * @param {string} warehouseId - Warehouse ID
 * @param {Date} date - Delivery date
 * @param {string} slot - Slot type (e.g. MORNING, AFTERNOON, EVENING)
 * @returns {Promise<Object>} Booked slot information
 */
/**
 * Atomic increment: only increment booked if booked < capacity to prevent overbooking.
 * Uses findFirst (partial unique on routeMapId) then raw SQL UPDATE for atomicity.
 *
 * @param {object} tx - Prisma transaction client
 * @param {string} warehouseId - Warehouse ID
 * @param {Date} date - Delivery date
 * @param {string} slot - Slot key (e.g. "09:00-12:00" or "MORNING")
 * @param {string|null} [routeMapId] - Route for per-route capacity; null for legacy slot
 */
export async function bookDeliverySlotWithTx(tx, warehouseId, date, slot, routeMapId = null) {
  const deliveryDate = toUTCDateOnly(date)
  if (!deliveryDate) throw new Error('Invalid delivery date')
  const slotKey = normalizeLegacySlotKey(slot)
  const routeId = routeMapId ?? null

  const where = {
    warehouseId,
    date: deliveryDate,
    slot: slotKey,
    routeMapId: routeId,
  }

  let deliverySlotRow = await tx.deliverySlot.findFirst({ where })
  if (!deliverySlotRow) {
    if (routeId) {
      throw new Error(`This delivery slot is not available for your delivery address.`)
    }
    const anySlotForKey = await tx.deliverySlot.findFirst({
      where: { warehouseId, date: deliveryDate, slot: slotKey },
      select: { id: true, routeMapId: true },
    })
    if (anySlotForKey?.routeMapId) {
      throw new Error(`This delivery slot is not available for your delivery address. Please select a slot for your area.`)
    }
    deliverySlotRow = await tx.deliverySlot.create({
      data: {
        warehouseId,
        date: deliveryDate,
        slot: slotKey,
        routeMapId: null,
        capacity: DEFAULT_SLOT_CAPACITY,
        booked: 0,
        isActive: true,
      },
    })
  }

  if (!deliverySlotRow.isActive) {
    throw new Error(`Slot ${slot} is not available for ${deliveryDate.toISOString()}`)
  }

  const result = await tx.$queryRaw`
    UPDATE "DeliverySlot"
    SET "booked" = "booked" + 1
    WHERE "id" = ${deliverySlotRow.id}
      AND "booked" < "capacity"
    RETURNING *
  `
  const updated = Array.isArray(result) ? result[0] : result
  if (!updated) {
    throw new Error(`Slot ${slot} is full for ${deliveryDate.toISOString()}`)
  }

  logger.info('[DeliverySlot] Slot booked (tx, atomic)', {
    warehouseId,
    date: deliveryDate,
    slot: slotKey,
    routeMapId: routeId,
    booked: updated.booked,
    capacity: updated.capacity,
  })
  return updated
}

const SLOT_RELEASE_RETRIES = 2
const SLOT_RELEASE_RETRY_MS = 80

/**
 * Release delivery slot inside a Prisma transaction with retries (for cancel / modify).
 * Reduces permanent capacity drift on transient failures.
 *
 * @param {object} tx - Prisma transaction client
 * @param {string} warehouseId - Warehouse ID
 * @param {Date} date - Delivery date
 * @param {string} slot - Slot type (legacy ids normalized internally)
 * @param {string|null|undefined} [routeMapId] - Optional. When set, release the slot for this route; when null/undefined, resolve via legacy then fallback.
 * @returns {Promise<{ released: boolean, error?: string }>} released true if decremented; error set on final failure
 */
export async function releaseDeliverySlotWithTxRetry(tx, warehouseId, date, slot, routeMapId = undefined) {
  let lastErr = null
  for (let attempt = 0; attempt <= SLOT_RELEASE_RETRIES; attempt++) {
    try {
      await releaseDeliverySlotWithTx(tx, warehouseId, date, slot, routeMapId)
      return { released: true }
    } catch (err) {
      lastErr = err
      if (attempt < SLOT_RELEASE_RETRIES) {
        await new Promise((r) => setTimeout(r, SLOT_RELEASE_RETRY_MS))
      }
    }
  }
  return { released: false, error: lastErr?.message }
}

/**
 * Release one capacity from a specific DeliverySlot row by id (use when order has deliverySlotId).
 * Atomic: UPDATE ... SET booked = booked - 1 WHERE id = ? AND booked > 0 to prevent negative booked under concurrency.
 */
export async function releaseDeliverySlotByIdWithTx(tx, deliverySlotId) {
  if (!deliverySlotId) return
  const result = await tx.$queryRaw`
    UPDATE "DeliverySlot"
    SET "booked" = "booked" - 1
    WHERE "id" = ${deliverySlotId}
      AND "booked" > 0
    RETURNING id, "booked"
  `
  const updated = Array.isArray(result) ? result[0] : result
  if (!updated) {
    logger.warn('[DeliverySlot] Slot release by id skipped (not found or already zero)', { deliverySlotId })
    return
  }
  logger.info('[DeliverySlot] Slot released (tx, by id)', { deliverySlotId })
}

/**
 * Release delivery slot inside a Prisma transaction (for cancel / modify).
 * When routeMapId is provided, finds the row for that route; when null/undefined, tries legacy (routeMapId null)
 * then fallback: find all rows for (warehouseId, date, slot) and pick one with booked > 0 (prefer legacy).
 * Ensures route-scoped slots are decremented even when order has no deliverySlotId.
 *
 * @param {object} tx - Prisma transaction client
 * @param {string} warehouseId - Warehouse ID
 * @param {Date} date - Delivery date
 * @param {string} slot - Slot type
 * @param {string|null|undefined} [routeMapId] - Optional. If string, release that route's row; if null/undefined, resolve via legacy then fallback.
 * @returns {Promise<void>}
 */
export async function releaseDeliverySlotWithTx(tx, warehouseId, date, slot, routeMapId = undefined) {
  const deliveryDate = toUTCDateOnly(date)
  if (!deliveryDate) return
  const slotKey = normalizeLegacySlotKey(slot)

  let row = null

  if (routeMapId != null && routeMapId !== '') {
    row = await tx.deliverySlot.findFirst({
      where: { warehouseId, date: deliveryDate, slot: slotKey, routeMapId },
      select: { id: true, booked: true, routeMapId: true },
    })
  }

  if (!row) {
    const legacyWhere = { warehouseId, date: deliveryDate, slot: slotKey, routeMapId: null }
    row = await tx.deliverySlot.findFirst({ where: legacyWhere, select: { id: true, booked: true, routeMapId: true } })
  }

  if (!row || row.booked <= 0) {
    const candidates = await tx.deliverySlot.findMany({
      where: { warehouseId, date: deliveryDate, slot: slotKey, booked: { gt: 0 } },
      select: { id: true, booked: true, routeMapId: true },
    })
    if (candidates.length === 0) {
      logger.warn('[DeliverySlot] Slot release skipped (no row with booked > 0)', {
        warehouseId,
        date: deliveryDate,
        slot: slotKey,
      })
      return
    }
    row = candidates.find((c) => c.routeMapId === null) ?? candidates[0]
    logger.warn('[DeliverySlot] Reconciliation warning: ambiguous slot release (multiple rows; picked one with booked > 0)', {
      warehouseId,
      date: deliveryDate,
      slot: slotKey,
      pickedRouteMapId: row.routeMapId,
      candidateCount: candidates.length,
    })
  }

  const result = await tx.$queryRaw`
    UPDATE "DeliverySlot"
    SET "booked" = "booked" - 1
    WHERE "id" = ${row.id}
      AND "booked" > 0
    RETURNING id, "booked"
  `
  const updated = Array.isArray(result) ? result[0] : result
  if (!updated) {
    logger.warn('[DeliverySlot] Slot release no-op (concurrent release or already zero)', { slotId: row.id })
    return
  }
  logger.info('[DeliverySlot] Slot released (tx)', { warehouseId, date: deliveryDate, slot: slotKey, slotId: row.id })
}

/**
 * Release delivery slot (when order cancelled) - standalone, outside transaction.
 *
 * @param {string} warehouseId - Warehouse ID
 * @param {Date} date - Delivery date
 * @param {string} slot - Slot type
 * @returns {Promise<void>}
 */
export async function releaseDeliverySlot(warehouseId, date, slot) {
  try {
    const deliveryDate = toUTCDateOnly(date)
    if (!deliveryDate) return
    const slotKey = normalizeLegacySlotKey(slot)

    await prisma.deliverySlot.update({
      where: {
        warehouseId_date_slot_routeMapId: {
          warehouseId,
          date: deliveryDate,
          slot: slotKey,
          routeMapId: null
        }
      },
      data: {
        booked: {
          decrement: 1
        }
      }
    })

    logger.info('[DeliverySlot] Slot released', {
      warehouseId,
      date: deliveryDate,
      slot: slotKey
    })
  } catch (error) {
    logger.error('[DeliverySlot] Error releasing slot', {
      error: error.message,
      warehouseId,
      date,
      slot
    })
    // Don't throw - slot release failure shouldn't block cancellation
  }
}

/**
 * Parse slot string "start-end" (e.g. "09:00-12:00") into { startTime, endTime }.
 * @param {string} slotKey
 * @returns {{ startTime: string, endTime: string } | null}
 */
function parseSlotKey(slotKey) {
  if (!slotKey || typeof slotKey !== 'string') return null
  const idx = slotKey.indexOf('-')
  if (idx <= 0 || idx === slotKey.length - 1) return null
  return { startTime: slotKey.slice(0, idx).trim(), endTime: slotKey.slice(idx + 1).trim() }
}

/**
 * Normalize legacy slot id to canonical DB key so booking and release use the same row.
 * Legacy display ids are "MORNING-06:00", "AFTERNOON-12:00", etc.; DB row uses "MORNING", "AFTERNOON", "EVENING".
 * Partner-style slots ("09:00-12:00") are returned unchanged.
 * @param {string} slotString - Client slot id (e.g. "MORNING-06:00" or "09:00-12:00")
 * @returns {string} Canonical slot key for DB
 */
export function normalizeLegacySlotKey(slotString) {
  if (!slotString || typeof slotString !== 'string') return slotString
  const s = slotString.trim()
  if (/^MORNING(-|$)/i.test(s)) return 'MORNING'
  if (/^AFTERNOON(-|$)/i.test(s)) return 'AFTERNOON'
  if (/^EVENING(-|$)/i.test(s)) return 'EVENING'
  if (/^NIGHT(-|$)/i.test(s)) return 'NIGHT'
  return s
}

/**
 * Resolve pincode to routeMapIds for a warehouse (via RouteMapPincode).
 * Returns empty array if no mapping; consumer can then show all slots or none (caller decides).
 *
 * @param {string} warehouseId - Warehouse ID
 * @param {string} pincode - Delivery pincode
 * @returns {Promise<string[]>} RouteMap IDs that serve this pincode for this warehouse
 */
export async function resolveRouteMapIdsForPincode(warehouseId, pincode) {
  if (!warehouseId || !pincode) return []
  try {
    const rows = await prisma.routeMapPincode.findMany({
      where: {
        pincode: String(pincode).trim(),
        routeMap: { warehouseId },
      },
      select: { routeMapId: true },
    })
    return [...new Set(rows.map((r) => r.routeMapId))]
  } catch (err) {
    logger.warn('[DeliverySlot] resolveRouteMapIdsForPincode failed', { warehouseId, pincode, error: err.message })
    return []
  }
}

/**
 * Resolve address to routeMapIds for a warehouse. Loads address by id and uses pincode.
 * Returns empty array if address not found or no mapping (caller treats as no filter).
 *
 * @param {string} warehouseId - Warehouse ID
 * @param {string} addressId - Address ID (must belong to user when used from controller)
 * @returns {Promise<string[]>} RouteMap IDs that serve this address's pincode
 */
export async function resolveRouteMapIdsForAddress(warehouseId, addressId) {
  if (!warehouseId || !addressId) return []
  try {
    const address = await prisma.address.findUnique({
      where: { id: addressId },
      select: { pincode: true },
    })
    if (!address?.pincode) return []
    return resolveRouteMapIdsForPincode(warehouseId, address.pincode)
  } catch (err) {
    logger.warn('[DeliverySlot] resolveRouteMapIdsForAddress failed', { warehouseId, addressId, error: err.message })
    return []
  }
}

/**
 * Get available slots for a date.
 * Returns Partner-configured slots (from DeliverySlot) when present; otherwise fallback to default 7 slots.
 * When routeMapIds is provided, only slots for those routes (or legacy routeMapId=null) are returned.
 *
 * @param {string} warehouseId - Warehouse ID
 * @param {Date} date - Delivery date
 * @param {{ routeMapIds?: string[] }} options - Optional. routeMapIds: filter by these routes; include slots with routeMapId null (legacy). Omit for all slots.
 * @returns {Promise<Array>} Available slots with availability info
 */
export async function getAvailableSlots(warehouseId, date, options = {}) {
  try {
    const deliveryDate = toUTCDateOnly(date)
    if (!deliveryDate) return []

    const where = { warehouseId, date: deliveryDate, isActive: true }
    const routeMapIds = options.routeMapIds
    // When pincode/address has no mapping, routeMapIds is []. Return all slots (route-scoped + legacy), not just legacy.
    if (Array.isArray(routeMapIds) && routeMapIds.length > 0) {
      where.OR = [
        { routeMapId: { in: routeMapIds } },
        { routeMapId: null },
      ]
    }

    const dbSlots = await prisma.deliverySlot.findMany({
      where,
      orderBy: [{ slot: 'asc' }],
      include: {
        routeMap: { select: { id: true, area: true } },
      },
    })

    let resultSlots = []
    if (dbSlots.length > 0) {
      resultSlots = dbSlots.map((row) => {
        const parsed = parseSlotKey(row.slot)
        let startTime, endTime
        if (parsed) {
          startTime = parsed.startTime
          endTime = parsed.endTime
        } else {
          const labelRange = SLOT_LABEL_TO_TIME[row.slot]
          if (labelRange) {
            startTime = labelRange.startTime
            endTime = labelRange.endTime
          } else {
            startTime = row.slot
            endTime = row.slot
          }
        }
        const available = row.capacity - row.booked
        if (row.booked > row.capacity || available < 0) {
          logger.warn('[DeliverySlot] BOOKED_EXCEEDS_CAPACITY – consider running reconciliation', {
            code: 'BOOKED_EXCEEDS_CAPACITY',
            slotId: row.id,
            warehouseId: row.warehouseId,
            date: row.date,
            slot: row.slot,
            booked: row.booked,
            capacity: row.capacity,
          })
        }
        const base = {
          id: row.slot,
          slot: row.slot,
          time: formatTimeSlot(startTime, endTime) ?? row.slot,
          startTime,
          endTime,
          label: parsed ? (formatTimeSlot(startTime, endTime) ?? row.slot) : row.slot,
          available: Math.max(0, available),
          capacity: row.capacity,
          booked: row.booked,
          isAvailable: available > 0,
          slotId: row.id,
        }
        if (row.routeMapId != null) {
          base.routeMapId = row.routeMapId
          if (row.routeMap?.area) base.routeArea = row.routeMap.area
        }
        return base
      })
    } else {
      // Fallback: default time slots (backward compatibility when no Partner-configured slots)
      const defaultSlots = [
        { slot: 'MORNING', startTime: '06:00', endTime: '08:00', label: 'Morning' },
        { slot: 'MORNING', startTime: '08:00', endTime: '10:00', label: 'Morning' },
        { slot: 'MORNING', startTime: '10:00', endTime: '12:00', label: 'Morning' },
        { slot: 'AFTERNOON', startTime: '12:00', endTime: '14:00', label: 'Afternoon' },
        { slot: 'AFTERNOON', startTime: '14:00', endTime: '16:00', label: 'Afternoon' },
        { slot: 'EVENING', startTime: '16:00', endTime: '18:00', label: 'Evening' },
        { slot: 'EVENING', startTime: '18:00', endTime: '20:00', label: 'Evening' },
      ]
      for (const slotDef of defaultSlots) {
        const availability = await checkSlotAvailability(warehouseId, deliveryDate, slotDef.slot)
        resultSlots.push({
          id: `${slotDef.slot}-${slotDef.startTime}`,
          slot: slotDef.slot,
          time: formatTimeSlot(slotDef.startTime, slotDef.endTime),
          startTime: slotDef.startTime,
          endTime: slotDef.endTime,
          label: slotDef.label,
          ...availability,
        })
      }
    }

    // Filter slots based on order placement time (IST timezone)
    const now = new Date()
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000
    const istDate = new Date(utcTime + 3600000 * 5.5)
    const istHour = istDate.getHours()
    const istMin = istDate.getMinutes()
    const totalMinutes = istHour * 60 + istMin

    let targetShift = 'MORNING'
    if (totalMinutes >= 7 * 60 && totalMinutes < 15 * 60) {
      targetShift = 'EVENING' // 7:00 AM - 3:00 PM -> Evening Shift only
    } else {
      targetShift = 'MORNING' // 3:00 PM - 7:00 AM -> Morning Shift only
    }

    const parseTimeToMin = (t) => {
      if (!t) return 0
      const parts = t.split(':')
      return parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0)
    }

    return resultSlots.filter(s => {
      const startMin = parseTimeToMin(s.startTime)
      let slotShift = 'EVENING'
      if (/MORNING/i.test(s.slot)) {
        slotShift = 'MORNING'
      } else if (s.startTime) {
        if (startMin >= 5 * 60 && startMin < 12 * 60) {
          slotShift = 'MORNING'
        }
      }
      return slotShift === targetShift
    })

  } catch (error) {
    logger.error('[DeliverySlot] Error getting available slots', {
      error: error.message,
      warehouseId,
      date,
    })
    return [
      {
        slot: 'MORNING',
        time: '6:00 AM to 8:00 AM',
        available: DEFAULT_SLOT_CAPACITY,
        capacity: DEFAULT_SLOT_CAPACITY,
        booked: 0,
        isAvailable: true,
      },
    ]
  }
}

