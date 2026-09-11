import { randomUUID } from 'crypto'
import logger from '../utils/logger.js'
import { calculateItemNetEligibleRefund, executeFinancialResolution } from './financialOrchestrationService.js'

/**
 * Replacement Resolution Service for OMS Core.
 * Manages atomic replacement reservations, partner unavailable stock discrepancy reports,
 * customer fallback choices, price delta calculations, and replacement order creation.
 */
export async function createReplacementRequest({
  prisma,
  orderId,
  orderItemId,
  targetVariantId,
  quantity = 1,
  userId
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Verify target variant stock
    const variant = await tx.productVariant.findUnique({
      where: { id: targetVariantId },
      include: { unifiedInventory: true }
    })

    if (!variant) {
      throw new Error(`Target ProductVariant ${targetVariantId} not found`)
    }

    const availableStock = Number(variant.unifiedInventory?.availableQuantity || variant.stockQuantity || 0)
    if (availableStock < quantity) {
      return { ok: false, error: 'OUT_OF_STOCK', availableStock }
    }

    // 2. Reserve stock atomically with TTL
    const reservationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 Hours TTL
    const reservation = await tx.inventoryReservation.create({
      data: {
        id: randomUUID(),
        userId,
        productVariantId: targetVariantId,
        quantity,
        status: 'REPLACEMENT_PENDING_APPROVAL',
        expiresAt: reservationExpiresAt,
        metadata: { orderId, orderItemId }
      }
    })

    // 3. Record return history
    const history = await tx.orderReturnHistory.create({
      data: {
        id: randomUUID(),
        orderId,
        fromPhase: 'DELIVERED',
        toPhase: 'REPLACEMENT_PENDING_APPROVAL',
        returnType: 'REPLACEMENT',
        reason: 'Customer requested replacement variant'
      }
    })

    logger.info('[ReplacementService] Atomic replacement hold created', {
      orderId,
      targetVariantId,
      reservationId: reservation.id
    })

    return {
      ok: true,
      reservationId: reservation.id,
      historyId: history.id,
      expiresAt: reservationExpiresAt
    }
  })
}

/**
 * Handles Partner reporting replacement item is physically missing or damaged in store.
 */
export async function reportReplacementUnavailable({
  prisma,
  orderId,
  returnId,
  reservationId = null,
  fallbackPreference = 'REFUND_IF_UNAVAILABLE'
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Release existing reservation hold if present
    if (reservationId) {
      await tx.inventoryReservation.updateMany({
        where: { id: reservationId },
        data: { status: 'CANCELLED' }
      })
    }

    // 2. Log forward state transition (never reverting backward)
    await tx.orderReturnHistory.create({
      data: {
        id: randomUUID(),
        orderId,
        fromPhase: 'REPLACEMENT_PENDING_APPROVAL',
        toPhase: 'REPLACEMENT_HOLD_RELEASED',
        returnType: 'REPLACEMENT',
        reason: 'Partner reported physical stock unavailable'
      }
    })

    // 3. Evaluate fallback preference
    if (fallbackPreference === 'REFUND_IF_UNAVAILABLE') {
      await tx.orderReturnHistory.create({
        data: {
          id: randomUUID(),
          orderId,
          fromPhase: 'REPLACEMENT_HOLD_RELEASED',
          toPhase: 'FALLBACK_RESOLVED',
          returnType: 'REFUND',
          reason: 'Automatic fallback to refund executed'
        }
      })

      const refundResult = await executeFinancialResolution({
        prisma: tx,
        orderId,
        refundPreference: 'ORIGINAL_PAYMENT',
        reason: 'Replacement item unavailable fallback refund'
      })

      return {
        ok: true,
        status: 'FALLBACK_RESOLVED',
        resolution: 'REFUND',
        refundResult
      }
    }

    // Default: Prompt customer for decision
    await tx.orderReturnHistory.create({
      data: {
        id: randomUUID(),
        orderId,
        fromPhase: 'REPLACEMENT_HOLD_RELEASED',
        toPhase: 'AWAITING_CUSTOMER_FALLBACK_CHOICE',
        returnType: 'REPLACEMENT',
        reason: 'Awaiting customer decision for fallback'
      }
    })

    return {
      ok: true,
      status: 'AWAITING_CUSTOMER_FALLBACK_CHOICE',
      resolution: 'PENDING_CUSTOMER_INPUT'
    }
  })
}

/**
 * Calculates replacement price delta against effective item paid amount.
 */
export async function calculateReplacementPriceDelta({
  prisma,
  orderId,
  originalOrderItemId,
  replacementVariantId
}) {
  const calculation = await calculateItemNetEligibleRefund({
    prisma,
    orderId,
    orderItemId: originalOrderItemId
  })

  const replacementVariant = await prisma.productVariant.findUnique({
    where: { id: replacementVariantId }
  })

  if (!replacementVariant) {
    throw new Error(`Replacement variant ${replacementVariantId} not found`)
  }

  const replacementEffectivePrice = Number(replacementVariant.salePrice || replacementVariant.price || 0)
  const originalEffectivePaid = calculation.itemPaidValue
  const delta = replacementEffectivePrice - originalEffectivePaid

  return {
    orderId,
    originalOrderItemId,
    originalEffectivePaid,
    replacementEffectivePrice,
    financialDelta: delta
  }
}
