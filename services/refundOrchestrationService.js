import { randomUUID } from 'crypto'
import pkg from '@prisma/client'
import { refundPayment } from '../utils/razorpayUtils.js'
import { createJuspayRefund } from '../utils/juspayUtils.js'
import logger from '../utils/logger.js'
import { validatePaymentLifecycleTransition } from './paymentLifecycleService.js'

const { RefundTransactionStatus } = pkg

/**
 * Gateway-confirmed refunds with durable ledger + idempotency key.
 * Payment: SUCCESS → REFUND_PENDING → REFUNDED (or stays REFUND_PENDING / ledger FAILED on gateway error).
 */
export async function orchestrateOnlineRefund({
  prisma,
  payment,
  orderId,
  orderNumber,
  reason,
  requestedBy,
  idempotencyKey,
  refundAmountRupees
}) {
  const key = idempotencyKey || `refund:${payment.id}:${orderId}`
  const amountNum = Number(payment.amount)
  const refundRupees =
    refundAmountRupees != null && Number.isFinite(Number(refundAmountRupees))
      ? Math.min(Number(refundAmountRupees), amountNum)
      : amountNum
  if (refundRupees <= 0) {
    return { ok: false, error: 'Invalid refund amount' }
  }
  const existing = await prisma.refundTransaction.findUnique({
    where: { idempotencyKey: key }
  })
  if (existing?.status === RefundTransactionStatus.SUCCEEDED) {
    return { ok: true, replay: true, gatewayRefundId: existing.gatewayRefundId }
  }

  const pre = validatePaymentLifecycleTransition(payment.status, 'REFUND_PENDING')
  if (!pre.valid && payment.status !== 'REFUND_PENDING') {
    return { ok: false, error: pre.error || 'Payment not refundable from current status' }
  }

  if (payment.status === 'SUCCESS') {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUND_PENDING' }
      })
      await tx.paymentStatusHistory.create({
        data: {
          paymentId: payment.id,
          fromStatus: payment.status,
          toStatus: 'REFUND_PENDING',
          changedBy: requestedBy || null,
          reason: reason || 'Refund initiated',
          metadata: { orderId, idempotencyKey: key, refundRupees }
        }
      })
      await tx.refundTransaction.upsert({
        where: { idempotencyKey: key },
        create: {
          id: randomUUID(),
          paymentId: payment.id,
          orderId,
          idempotencyKey: key,
          amount: refundRupees,
          status: RefundTransactionStatus.PENDING,
          requestedBy: requestedBy || null
        },
        update: {
          status: RefundTransactionStatus.PROCESSING,
          amount: refundRupees,
          updatedAt: new Date()
        }
      })
    })
  }

  const isJuspay =
    payment.gateway === 'JUSPAY' ||
    (payment.method && String(payment.method).startsWith('JUSPAY')) ||
    Boolean(payment.juspayOrderId)

  if (!isJuspay && !payment.razorpayPaymentId) {
    return { ok: false, error: 'Missing razorpayPaymentId for online refund' }
  }

  if (isJuspay && !payment.juspayOrderId && !orderNumber) {
    return { ok: false, error: 'Missing order identifier for Juspay refund' }
  }

  try {
    let refund
    if (isJuspay) {
      refund = await createJuspayRefund(
        payment.juspayOrderId || orderNumber,
        refundRupees,
        key
      )
    } else {
      refund = await refundPayment(payment.razorpayPaymentId, refundRupees, {
        orderId,
        orderNumber,
        reason: reason || 'Order cancelled by customer'
      })
    }

    const gatewayRefundId = refund.id

    await prisma.$transaction(async (tx) => {
      await tx.refundTransaction.update({
        where: { idempotencyKey: key },
        data: {
          status: RefundTransactionStatus.SUCCEEDED,
          gatewayRefundId: gatewayRefundId,
          finalizedAt: new Date(),
          rawResponse: refund,
          updatedAt: new Date()
        }
      })
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
          ...(isJuspay
            ? { juspayRefundId: gatewayRefundId }
            : { razorpayRefundId: gatewayRefundId }),
          refundedAt: new Date()
        }
      })
      await tx.paymentStatusHistory.create({
        data: {
          paymentId: payment.id,
          fromStatus: 'REFUND_PENDING',
          toStatus: 'REFUNDED',
          changedBy: requestedBy || null,
          reason: reason || 'Refund confirmed by gateway',
          metadata: { orderId, gatewayRefundId }
        }
      })
    })

    logger.info('[RefundOrchestrator] Refund finalized', {
      orderId,
      paymentId: payment.id,
      refundId: gatewayRefundId,
      gateway: isJuspay ? 'JUSPAY' : 'RAZORPAY'
    })
    return { ok: true, replay: false, gatewayRefundId }
  } catch (error) {
    logger.error('[RefundOrchestrator] Gateway refund failed', {
      message: error.message,
      orderId,
      paymentId: payment.id
    })
    await prisma.refundTransaction.updateMany({
      where: { idempotencyKey: key },
      data: {
        status: RefundTransactionStatus.FAILED,
        rawResponse: { message: error.message },
        updatedAt: new Date()
      }
    })
    return { ok: false, error: error.message }
  }
}
