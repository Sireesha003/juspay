import logger from '../utils/logger.js'
import { orchestratePostStatusPersist } from './orchestration/orderLifecycleOrchestrator.js'

/**
 * Runs after consumer DB projection is updated (e.g. delivery-api internal sync).
 * All socket + notification side effects go through OrderLifecycleOrchestrator.
 * @returns {Promise<object>} orchestrator result
 */
export async function afterConsumerOrderProjectionSync({
  orderId,
  status,
  previousStatus = null,
  eventId = null,
  source = 'INTERNAL_SYNC'
}) {
  try {
    return await orchestratePostStatusPersist({
      orderId,
      status,
      previousStatus,
      eventId,
      source,
      changedBy: null,
      recordStatusHistory: true,
      cancellationReason: null,
      extraSocketPayload: {}
    })
  } catch (e) {
    logger.error('[OrderSideEffects] orchestratePostStatusPersist failed', {
      orderId,
      message: e.message
    })
    return { ok: false, error: e.message }
  }
}
