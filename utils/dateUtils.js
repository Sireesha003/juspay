/**
 * UTC date-only normalization for slot dates and delivery dates.
 * Prevents timezone shift when comparing or storing calendar dates.
 */

/**
 * Parse YYYY-MM-DD string as date-only in UTC.
 * @param {string} dateStr - e.g. "2025-02-24"
 * @returns {Date | null} Date at UTC midnight, or null if invalid
 */
export function parseDateOnlyUTC(dateStr) {
  if (dateStr == null) return null
  const s = String(dateStr).trim()
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

/**
 * Normalize a Date or date string to UTC date-only (start of day UTC).
 * Use for slot date and delivery date consistency.
 * @param {Date | string} date
 * @returns {Date} Date at UTC midnight
 */
export function toUTCDateOnly(date) {
  if (date instanceof Date) {
    if (isNaN(date.getTime())) return null
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  }
  return parseDateOnlyUTC(date)
}

/**
 * Today in UTC (date-only, no time).
 * @returns {Date}
 */
export function todayUTC() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * True if slotDate is today or a future date (UTC).
 * @param {Date} slotDate - UTC date-only
 * @returns {boolean}
 */
export function isTodayOrFuture(slotDate) {
  if (!slotDate || !(slotDate instanceof Date)) return false
  const today = todayUTC()
  const t = new Date(Date.UTC(slotDate.getUTCFullYear(), slotDate.getUTCMonth(), slotDate.getUTCDate()))
  return t >= today
}

const HH_MM_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/

/**
 * Get current time in UTC as "HH:mm" (24h).
 * @returns {string}
 */
function nowUTCHHmm() {
  const now = new Date()
  const h = now.getUTCHours()
  const m = now.getUTCMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Parse slot start time from slot string (e.g. "09:00-12:00" -> "09:00", "MORNING-06:00" -> "06:00").
 * @param {string} slotString
 * @returns {string | null} HH:mm or null
 */
export function getSlotStartTime(slotString) {
  if (!slotString || typeof slotString !== 'string') return null
  const idx = slotString.indexOf('-')
  if (idx <= 0) return null
  const start = slotString.slice(0, idx).trim()
  return HH_MM_REGEX.test(start) ? start : null
}

/**
 * True if slot date is today (UTC) and slot start time has already passed (UTC).
 * Use to block booking of same-day slots that have started.
 * @param {Date} slotDate - UTC date-only
 * @param {string} slotString - e.g. "09:00-12:00"
 * @returns {boolean}
 */
export function isSlotStartInPast(slotDate, slotString) {
  if (!slotDate || !(slotDate instanceof Date) || !slotString) return false
  const today = todayUTC()
  const slotDay = new Date(Date.UTC(slotDate.getUTCFullYear(), slotDate.getUTCMonth(), slotDate.getUTCDate()))
  if (slotDay.getTime() !== today.getTime()) return false
  const start = getSlotStartTime(slotString)
  if (!start) return false
  const now = nowUTCHHmm()
  return now >= start
}
