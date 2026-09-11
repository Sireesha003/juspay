import { errorResponse, successResponse } from '../utils/responseHelper.js'
import { applyFanoutEnvelope } from '../config/socket.js'
import { FanoutEnvelopeSchema, InternalRealtimeLocationEmitSchema } from '../services/orchestration/schemas.js'
import { verifyInternalServiceRequest } from '../utils/internalRequestAuth.js'
import { orchestratePostLocationPersist } from '../services/orchestration/orderLifecycleOrchestrator.js'
import logger from '../utils/logger.js'

/**
 * POST /api/v1/internal/realtime/fanout
 * Body: { correlationId?, emits: [{ namespace, room, event, payload }] }
 */
export async function internalRealtimeFanout(req, res) {
  try {
    if (!verifyInternalServiceRequest(req, 'realtime-fanout')) {
      return errorResponse(res, 401, 'Unauthorized internal sync')
    }
    const body = req.body || {}
    const parsed = FanoutEnvelopeSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(res, 400, 'Invalid fan-out envelope', parsed.error.flatten())
    }
    await applyFanoutEnvelope(parsed.data)
    return successResponse(res, 200, { applied: true }, 'Fan-out applied')
  } catch (error) {
    logger.error('[InternalRealtime] fanout failed', { message: error.message })
    return errorResponse(res, 500, error.message || 'Fan-out failed')
  }
}

/**
 * POST /api/v1/internal/realtime/emit-location
 * Single path for socket rider location emits (same throttle / gate as consumer-agent path).
 */
export async function internalRealtimeLocationEmit(req, res) {
  try {
    if (!verifyInternalServiceRequest(req, 'realtime-emit-location')) {
      return errorResponse(res, 401, 'Unauthorized internal sync')
    }
    const parsed = InternalRealtimeLocationEmitSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return errorResponse(res, 400, 'Invalid location emit payload', parsed.error.flatten())
    }
    const { orderId, location, eta } = parsed.data
    const result = await orchestratePostLocationPersist({
      orderId,
      location,
      eta: eta ?? null,
      meta: { source: 'DELIVERY_INTERNAL_LOCATION_HTTP' }
    })
    return successResponse(
      res,
      200,
      { orderId, applied: !result?.skipped, ...result },
      result?.skipped ? 'Location emit skipped' : 'Location emit applied'
    )
  } catch (error) {
    logger.error('[InternalRealtime] emit-location failed', { message: error.message })
    return errorResponse(res, 500, error.message || 'Location emit failed')
  }
}
