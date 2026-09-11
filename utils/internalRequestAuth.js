import crypto from 'crypto'
import logger from './logger.js'

const INTERNAL_SYNC_KEY = process.env.DELIVERY_API_SYNC_KEY || ''
const INTERNAL_SYNC_MAX_AGE_MS = parseInt(process.env.INTERNAL_SYNC_MAX_AGE_MS || '300000', 10)

/** When true, or in production (unless REQUIRE_INTERNAL_HMAC=false), HMAC headers are mandatory. */
export function isInternalHmacRequired() {
  const explicit = process.env.REQUIRE_INTERNAL_HMAC
  if (explicit === 'true') return true
  if (explicit === 'false') return false
  return process.env.NODE_ENV === 'production'
}

function verifyHmacSignature(req) {
  const ts = req.header('x-sync-ts')
  const sig = req.header('x-sync-signature')
  if (!ts || !sig || !INTERNAL_SYNC_KEY) return false

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return false
  if (Math.abs(Date.now() - tsNum) > INTERNAL_SYNC_MAX_AGE_MS) {
    logger.warn('[InternalAuth] sync timestamp outside allowed window', { ageMs: Math.abs(Date.now() - tsNum) })
    return false
  }

  const payload = JSON.stringify(req.body || {})
  const expected = crypto.createHmac('sha256', INTERNAL_SYNC_KEY).update(`${ts}.${payload}`).digest('hex')
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(String(sig).replace(/\s+/g, ''), 'hex')
    if (a.length !== b.length || a.length === 0) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * @param {import('express').Request} req
 * @param {string} [context] for logs
 * @returns {boolean}
 */
export function verifyInternalServiceRequest(req, context = 'internal') {
  const key = req.header('x-internal-sync-key')
  if (!INTERNAL_SYNC_KEY || !key || key !== INTERNAL_SYNC_KEY) {
    logger.warn('[InternalAuth] missing or invalid sync key', { context })
    return false
  }

  const strict = isInternalHmacRequired()
  const ts = req.header('x-sync-ts')
  const sig = req.header('x-sync-signature')

  if (strict) {
    if (!ts || !sig) {
      logger.warn('[InternalAuth] HMAC headers required but missing', { context, strict: true })
      return false
    }
    const ok = verifyHmacSignature(req)
    if (!ok) logger.warn('[InternalAuth] invalid HMAC signature', { context })
    return ok
  }

  if (ts || sig) {
    const ok = verifyHmacSignature(req)
    if (!ok) logger.warn('[InternalAuth] invalid optional HMAC', { context })
    return ok
  }

  logger.debug('[InternalAuth] dev mode — sync key only (set REQUIRE_INTERNAL_HMAC=true for strict)', {
    context
  })
  return true
}
