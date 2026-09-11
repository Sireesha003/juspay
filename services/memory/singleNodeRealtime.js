/**
 * In-process coordination for single-node deployments (no Redis).
 * Not safe across multiple Node processes.
 */

const dedupeExpiry = new Map()

function pruneDedupe(now) {
  if (dedupeExpiry.size < 5000) return
  for (const [k, exp] of dedupeExpiry) {
    if (exp <= now) dedupeExpiry.delete(k)
  }
}

/** @returns {boolean} true if this is the first claim for key within ttlSec */
export function claimInMemoryDedupeKey(key, ttlSec) {
  const now = Date.now()
  pruneDedupe(now)
  const exp = dedupeExpiry.get(key)
  if (exp && exp > now) return false
  dedupeExpiry.set(key, now + ttlSec * 1000)
  return true
}

const serialTails = new Map()

/**
 * Run async work serialized per lockKey (single process).
 * @template T
 * @param {string} lockKey
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function runSerialPerKey(lockKey, fn) {
  const prev = serialTails.get(lockKey) || Promise.resolve()
  const run = prev.catch(() => {}).then(() => fn())
  serialTails.set(lockKey, run.catch(() => {}))
  return run
}

const locBuckets = new Map()

function pruneLocBuckets(now) {
  if (locBuckets.size < 3000) return
  for (const [k, b] of locBuckets) {
    if (b.resetAt < now) locBuckets.delete(k)
  }
}

/** Sliding-window style cap per orderId (process-local). */
export function allowLocationEmitRate(orderId, maxPerSec) {
  const now = Date.now()
  pruneLocBuckets(now)
  let b = locBuckets.get(orderId)
  if (!b || now > b.resetAt) {
    locBuckets.set(orderId, { count: 1, resetAt: now + 1000 })
    return true
  }
  if (b.count >= maxPerSec) return false
  b.count += 1
  return true
}

const MIN_INTERVAL_MS = parseInt(process.env.LOCATION_SOCKET_MIN_INTERVAL_MS || '350', 10)
const MIN_MOVE_M = parseFloat(process.env.LOCATION_SOCKET_MIN_DISTANCE_M || '12')
const MAX_SAMPLE_AGE_MS = parseInt(process.env.LOCATION_SOCKET_MAX_SAMPLE_AGE_MS || '180000', 10)

const outboundLocationLast = new Map()

function toRad(d) {
  return (d * Math.PI) / 180
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Process-local gate for outbound rider location socket emits (all ingress paths).
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function evaluateLocationSocketGate(orderId, location) {
  const lat = Number(location?.lat)
  const lng = Number(location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'INVALID_COORDS' }
  }
  const tsRaw = location?.timestamp
  if (tsRaw) {
    const ts = Date.parse(tsRaw)
    if (Number.isFinite(ts) && Date.now() - ts > MAX_SAMPLE_AGE_MS) {
      return { ok: false, reason: 'STALE_SAMPLE' }
    }
  }
  const now = Date.now()
  const prev = outboundLocationLast.get(orderId)
  if (prev) {
    const dt = now - prev.t
    if (dt < MIN_INTERVAL_MS) {
      const d = haversineMeters(lat, lng, prev.lat, prev.lng)
      if (!Number.isFinite(d) || d < MIN_MOVE_M) {
        return { ok: false, reason: 'THROTTLED_OR_STATIC' }
      }
    }
  }
  return { ok: true }
}

export function recordLocationSocketEmit(orderId, location) {
  const lat = Number(location?.lat)
  const lng = Number(location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
  outboundLocationLast.set(orderId, { t: Date.now(), lat, lng })
  if (outboundLocationLast.size > 2500) {
    let n = 0
    for (const k of outboundLocationLast.keys()) {
      outboundLocationLast.delete(k)
      n += 1
      if (outboundLocationLast.size < 2000) break
      if (n > 600) break
    }
  }
}
