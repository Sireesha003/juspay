import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'
import { errorResponse, successResponse } from '../utils/responseHelper.js'
import { canonicalOrderStatus } from '../services/lifecycle/transitionRegistry.js'
import {
  InternalOrderLocationSyncSchema,
  InternalOrderStatusSyncSchema
} from '../services/orchestration/schemas.js'
import { verifyInternalServiceRequest } from '../utils/internalRequestAuth.js'

export async function syncOrderStatusFromDelivery(req, res) {
  try {
    if (!verifyInternalServiceRequest(req, 'order-sync-status')) {
      return errorResponse(res, 401, 'Unauthorized internal sync')
    }

    const parsed = InternalOrderStatusSyncSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return errorResponse(res, 400, 'Invalid sync payload', parsed.error.flatten())
    }
    const {
      eventId,
      orderId,
      status,
      agentId = null,
      deliveredAt = null,
      deliveryStatus = null
    } = parsed.data

    const canonical = canonicalOrderStatus(status)

    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, agentId: true, deliveredAt: true }
    })
    if (!existing) {
      return errorResponse(res, 404, 'Order not found')
    }

    // Validate status transition strictly
    const transitionCheck = validateOrderTransition(existing.status, canonical)
    if (!transitionCheck.valid && !transitionCheck.noOp) {
      logger.warn('[InternalSync] Blocked invalid status transition', {
        orderId,
        fromStatus: existing.status,
        toStatus: canonical,
        error: transitionCheck.error
      })
      return errorResponse(res, 422, transitionCheck.error || 'Invalid order status transition')
    }

    const sameStatus = existing.status === canonical
    const sameAgent = (existing.agentId || null) === (agentId || null)
    const sameDeliveredAt = !deliveredAt || !!existing.deliveredAt
    if (sameStatus && sameAgent && sameDeliveredAt) {
      return successResponse(res, 200, { orderId, eventId, applied: false }, 'Sync already applied')
    }

    const previousStatus = existing.status

    const updateData = {
      status: canonical,
      ...(agentId ? { agentId } : {}),
      ...(canonical === 'DELIVERED' || deliveredAt
        ? { deliveredAt: deliveredAt ? new Date(deliveredAt) : new Date() }
        : {})
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: updateData
      })

      const deliveryRowUpdate = {
        ...(agentId ? { agentId } : {}),
        ...(canonical === 'DELIVERED' || deliveredAt
          ? { deliveredAt: deliveredAt ? new Date(deliveredAt) : new Date() }
          : {})
      }

      if (deliveryStatus) {
        deliveryRowUpdate.status = deliveryStatus
      } else if (canonical === 'DELIVERED') {
        deliveryRowUpdate.status = 'DELIVERED'
      }

      await tx.delivery.upsert({
        where: { orderId },
        update: deliveryRowUpdate,
        create: {
          orderId,
          ...(agentId ? { agentId } : {}),
          status: deliveryStatus || (canonical === 'DELIVERED' ? 'DELIVERED' : 'PENDING'),
          ...(canonical === 'DELIVERED' || deliveredAt
            ? { deliveredAt: deliveredAt ? new Date(deliveredAt) : new Date() }
            : {})
        }
      })
    })

    logger.info('[InternalSync] Consumer order synced from delivery-api', {
      eventId,
      orderId,
      status: canonical,
      deliveryStatus,
      agentId
    })

    const { afterConsumerOrderProjectionSync } = await import(
      '../services/orderProjectionSideEffectsService.js'
    )
    const sideEffect = await afterConsumerOrderProjectionSync({
      orderId,
      status: canonical,
      previousStatus,
      eventId,
      source: 'INTERNAL_SYNC'
    })
    if (sideEffect?.skipped) {
      logger.info('[InternalSync] post-sync side effects skipped', {
        orderId,
        reason: sideEffect.reason
      })
    }

    return successResponse(res, 200, { orderId, eventId, applied: true }, 'Order sync applied')
  } catch (error) {
    logger.error('[InternalSync] Consumer sync failed', {
      error: error.message,
      stack: error.stack
    })
    return errorResponse(res, 500, 'Internal sync failed')
  }
}

/**
 * POST /api/v1/internal/order-sync/location
 * Project delivery.currentLocation into consumer DB (for REST live-tracking).
 */
export async function syncOrderLocationFromDelivery(req, res) {
  try {
    if (!verifyInternalServiceRequest(req, 'order-sync-location')) {
      return errorResponse(res, 401, 'Unauthorized internal sync')
    }
    const parsed = InternalOrderLocationSyncSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return errorResponse(res, 400, 'Invalid location projection payload', parsed.error.flatten())
    }
    const { orderId, location } = parsed.data
    await prisma.delivery.updateMany({
      where: { orderId },
      data: {
        currentLocation: location,
        lastLocationUpdate: new Date()
      }
    })
    return successResponse(res, 200, { orderId, applied: true }, 'Location projection applied')
  } catch (error) {
    logger.error('[InternalSync] Location projection failed', {
      error: error.message,
      stack: error.stack
    })
    return errorResponse(res, 500, 'Location projection failed')
  }
}
