/**
 * Process-local dedupe for internal HTTP fan-out envelopes (same correlationId replay).
 */

const fanoutLocks = new Map()

function prune(now) {
  if (fanoutLocks.size < 2000) return
  for (const [k, exp] of fanoutLocks) {
    if (exp <= now) fanoutLocks.delete(k)
  }
}

/**
 * @param {string} [correlationId]
 * @param {number} [ttlSec]
 * @returns {Promise<boolean>} true if emit should proceed
 */
export async function acquireFanoutLock(correlationId, ttlSec = 4) {
  if (!correlationId) return true
  const now = Date.now()
  prune(now)
  const exp = fanoutLocks.get(correlationId)
  if (exp && exp > now) return false
  fanoutLocks.set(correlationId, now + ttlSec * 1000)
  return true
}
