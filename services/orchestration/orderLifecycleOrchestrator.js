import { randomUUID } from 'crypto'
import logger from '../../utils/logger.js'
import { emitOrderStatusUpdate, emitLocationUpdate } from '../../config/socket.js'
import { enqueueOrderNotificationJob } from '../../queues/orderNotificationQueue.js'
import { createOrderStatusHistory } from '../../utils/orderStatusHistory.js'
import { OrderNotificationJobSchema } from './schemas.js'
import { incCounter } from '../metrics/realtimeMetrics.js'
import {
  claimInMemoryDedupeKey,
  runSerialPerKey,
  allowLocationEmitRate,
  evaluateLocationSocketGate,
  recordLocationSocketEmit
} from '../memory/singleNodeRealtime.js'

/**
 * Central entry for realtime + notification side effects after order status is already persisted.
 * Controllers and jobs must not call emitOrderStatusUpdate / enqueueOrderNotificationJob directly.
 */
export async function orchestratePostStatusPersist({
  orderId,
  status,
  previousStatus = null,
  eventId = null,
  source = 'UNKNOWN',
  changedBy = null,
  /** When true, append OrderStatusHistory (e.g. delivery internal sync — no controller history). */
  recordStatusHistory = false,
  cancellationReason = null,
  extraSocketPayload = {}
}) {
  const correlationId = eventId || randomUUID()

  if (eventId) {
    const first = claimInMemoryDedupeKey(`evt:status:${eventId}`, 86400)
    if (!first) {
      incCounter('orchestrator_status_deduped')
      logger.info('[OrderLifecycleOrchestrator] duplicate status event skipped', {
        orderId,
        eventId,
        source
      })
      return { ok: true, skipped: true, reason: 'DUPLICATE_EVENT_ID' }
    }
  }

  const lockKey = `order:status:${orderId}`
  return runSerialPerKey(lockKey, async () => {
    try {
      if (recordStatusHistory && previousStatus != null && previousStatus !== status) {
        try {
          await createOrderStatusHistory(
            orderId,
            previousStatus,
            status,
            changedBy,
            cancellationReason,
            `source=${source};correlation=${correlationId}`
          )
        } catch (e) {
          logger.warn('[OrderLifecycleOrchestrator] status history write failed', {
            orderId,
            message: e.message
          })
        }
      }

      await emitOrderStatusUpdate(orderId, status, {
        ...extraSocketPayload,
        eventId: eventId || undefined,
        source,
        previousStatus,
        changedBy,
        correlationId
      })
      incCounter('orchestrator_status_socket_emitted')

      const jobPayload = OrderNotificationJobSchema.parse({
        orderId,
        status,
        previousStatus,
        eventId,
        source
      })
      await enqueueOrderNotificationJob(jobPayload)
      incCounter('orchestrator_status_notify_enqueued')

      return { ok: true, correlationId }
    } catch (e) {
      logger.error('[OrderLifecycleOrchestrator] post-status persist failed', {
        orderId,
        message: e.message,
        source
      })
      incCounter('orchestrator_status_error')
      throw e
    }
  })
}

/**
 * Realtime rider location after DB writes (DeliveryLocationHistory etc. already done by caller).
 */
export async function orchestratePostLocationPersist({
  orderId,
  location,
  eta = null,
  meta = {},
  maxEmitsPerSecond = 25
}) {
  const lockKey = `order:location:${orderId}`
  return runSerialPerKey(lockKey, async () => {
    const gate = evaluateLocationSocketGate(orderId, location)
    if (!gate.ok) {
      incCounter('orchestrator_location_gate_blocked')
      logger.debug('[OrderLifecycleOrchestrator] location gate', { orderId, reason: gate.reason })
      return { ok: true, skipped: true, reason: gate.reason }
    }

    const allowed = allowLocationEmitRate(orderId, maxEmitsPerSecond)
    if (!allowed) {
      incCounter('orchestrator_location_throttled')
      logger.debug('[OrderLifecycleOrchestrator] location emit throttled', { orderId })
      return { ok: true, skipped: true, reason: 'THROTTLED' }
    }

    await emitLocationUpdate(orderId, location, eta, {
      ...meta,
      correlationId: meta.correlationId || randomUUID()
    })
    recordLocationSocketEmit(orderId, location)
    incCounter('orchestrator_location_socket_emitted')
    return { ok: true }
  })
}
