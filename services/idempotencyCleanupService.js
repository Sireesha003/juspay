import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'

// How old (ms) an IdempotencyRecord must be before it's eligible for deletion.
const TTL_MS = parseInt(process.env.IDEMPOTENCY_TTL_MS || `${24 * 60 * 60 * 1000}`, 10)
const SWEEP_INTERVAL_MS = parseInt(process.env.IDEMPOTENCY_SWEEP_INTERVAL_MS || `${60 * 60 * 1000}`, 10)
const BATCH_LIMIT = parseInt(process.env.IDEMPOTENCY_SWEEP_BATCH || '5000', 10)

let timer = null
let isRunning = false

export async function pruneIdempotencyRecords() {
  if (isRunning) return { skipped: true }
  isRunning = true
  try {
    const cutoff = new Date(Date.now() - TTL_MS)
    const stale = await prisma.idempotencyRecord.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_LIMIT,
    })
    if (stale.length === 0) {
      return { deleted: 0 }
    }
    const { count } = await prisma.idempotencyRecord.deleteMany({
      where: { id: { in: stale.map((r) => r.id) } },
    })
    if (count > 0) {
      logger.info('[IdempotencyCleanup] Pruned stale records', { count, cutoff: cutoff.toISOString() })
    }
    return { deleted: count }
  } catch (error) {
    logger.warn('[IdempotencyCleanup] Sweep failed', { message: error.message })
    return { error: error.message }
  } finally {
    isRunning = false
  }
}

export function startIdempotencyCleanupWorker() {
  if (timer) return
  logger.info('[IdempotencyCleanup] Starting worker', { intervalMs: SWEEP_INTERVAL_MS, ttlMs: TTL_MS })
  timer = setInterval(() => {
    pruneIdempotencyRecords().catch(() => {})
  }, SWEEP_INTERVAL_MS)
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopIdempotencyCleanupWorker() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
