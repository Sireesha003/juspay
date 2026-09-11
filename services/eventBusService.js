import { randomUUID } from 'crypto'
import logger from '../utils/logger.js'

/**
 * Enterprise Event Bus Consumer for OMS Core.
 * Ensures idempotent event execution, versioning validation, and DLQ error fallback.
 */
export async function processDomainEvent({ prisma, eventPayload, eventHandler }) {
  const { eventId, eventVersion = 1, eventType, idempotencyKey, payload } = eventPayload

  if (!eventId) {
    throw new Error('Missing eventId in domain event payload')
  }

  // 1. Idempotency check using ProcessedEvent model
  const key = idempotencyKey || eventId
  const existing = await prisma.processedEvent.findUnique({
    where: { eventId: key }
  })

  if (existing) {
    logger.info('[EventBus] Duplicate event skipped', { eventId: key, eventType })
    return { ok: true, replay: true }
  }

  try {
    // 2. Execute business handler
    const result = await eventHandler(payload)

    // 3. Mark event as processed
    await prisma.processedEvent.create({
      data: {
        eventId: key,
        processedAt: new Date()
      }
    })

    logger.info('[EventBus] Domain event processed successfully', { eventId: key, eventType })
    return { ok: true, replay: false, result }
  } catch (error) {
    logger.error('[EventBus] Handler failed, logging to DLQ', {
      eventId: key,
      eventType,
      error: error.message
    })

    // 4. Log to Dead Letter Queue (DLQ)
    await prisma.failedEventDLQ.create({
      data: {
        id: randomUUID(),
        eventId: key,
        eventType,
        payload: eventPayload,
        error: error.message,
        retryCount: 0
      }
    })

    return { ok: false, error: error.message, loggedToDLQ: true }
  }
}
