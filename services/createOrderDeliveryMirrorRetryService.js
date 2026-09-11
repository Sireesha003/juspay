import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'

const RETRY_INTERVAL_MS = parseInt(process.env.CONSUMER_CREATE_ORDER_MIRROR_RETRY_MS || '120000', 10)
const BATCH_SIZE = parseInt(process.env.CONSUMER_CREATE_ORDER_MIRROR_BATCH || '25', 10)
const DELIVERY_API_BASE_URL = (
  process.env.DELIVERY_API_BASE_URL || 'http://localhost:3005/api/v1'
).replace(/\/$/, '')
const DELIVERY_API_SYNC_KEY = process.env.DELIVERY_API_SYNC_KEY || ''

const PAYLOAD_KIND = 'CONSUMER_DELIVERY_CREATE_ORDER'

let timer = null
let running = false

async function postCreateOrderMirror(body) {
  const response = await fetch(`${DELIVERY_API_BASE_URL}/order/create-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(DELIVERY_API_SYNC_KEY ? { 'x-internal-sync-key': DELIVERY_API_SYNC_KEY } : {})
    },
    body: JSON.stringify(body)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err = new Error(payload?.message || `Delivery create-order failed: ${response.status}`)
    err.statusCode = response.status
    throw err
  }
  return payload
}

/**
 * Persist a failed consumer → delivery create-order mirror for background retry.
 */
export async function saveFailedCreateOrderMirror({ orderId, body, errorMessage }) {
  try {
    await prisma.failedSyncEvent.create({
      data: {
        orderId,
        eventType: 'ASSIGNMENT',
        payload: {
          kind: PAYLOAD_KIND,
          targetBaseUrl: DELIVERY_API_BASE_URL,
          body,
          errorMessage: errorMessage || null,
          replay: true
        },
        status: 'PENDING',
        retryCount: 0,
        lastAttemptAt: new Date()
      }
    })
    logger.warn('[CreateOrderMirror] Persisted failed delivery create-order for retry', { orderId })
  } catch (e) {
    logger.error('[CreateOrderMirror] Failed to persist retry row', {
      orderId,
      message: e.message
    })
  }
}

async function retryOne(event) {
  const p = event.payload || {}
  if (p.kind !== PAYLOAD_KIND || !p.body) {
    await prisma.failedSyncEvent.update({
      where: { id: event.id },
      data: { status: 'FAILED', retryCount: { increment: 1 }, lastAttemptAt: new Date() }
    })
    return
  }
  try {
    await postCreateOrderMirror(p.body)
    await prisma.failedSyncEvent.update({
      where: { id: event.id },
      data: { status: 'SUCCESS', lastAttemptAt: new Date() }
    })
    logger.info('[CreateOrderMirror] Retry succeeded', { id: event.id, orderId: event.orderId })
  } catch (err) {
    const next = event.retryCount + 1
    const exhausted = next >= 15
    await prisma.failedSyncEvent.update({
      where: { id: event.id },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        retryCount: next,
        lastAttemptAt: new Date()
      }
    })
    logger.warn('[CreateOrderMirror] Retry failed', {
      id: event.id,
      orderId: event.orderId,
      message: err.message,
      exhausted
    })
  }
}

export async function runCreateOrderMirrorRetryPass() {
  if (running) return
  running = true
  try {
    const pending = await prisma.failedSyncEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE * 4
    })
    const events = pending.filter((e) => e.payload?.kind === PAYLOAD_KIND).slice(0, BATCH_SIZE)
    for (const ev of events) {
      await retryOne(ev)
    }
  } catch (e) {
    logger.error('[CreateOrderMirror] Retry pass error', { message: e.message })
  } finally {
    running = false
  }
}

export function startCreateOrderDeliveryMirrorRetryWorker() {
  if (timer) return
  if (!DELIVERY_API_SYNC_KEY) {
    logger.warn('[CreateOrderMirror] DELIVERY_API_SYNC_KEY unset; retry worker started but mirror calls may fail')
  }
  timer = setInterval(() => {
    runCreateOrderMirrorRetryPass().catch(() => {})
  }, RETRY_INTERVAL_MS)
  runCreateOrderMirrorRetryPass().catch(() => {})
}

export function stopCreateOrderDeliveryMirrorRetryWorker() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
