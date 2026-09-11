import { randomUUID } from 'crypto'
import logger from '../utils/logger.js'
import { orchestrateOnlineRefund } from './refundOrchestrationService.js'

/**
 * Financial Decision & Orchestration Engine for OMS Core.
 * Calculates exact item-level refund ceilings, allocates discounts/coupons,
 * executes atomic wallet credits, and routes gateway refunds via refundOrchestrationService.
 */
export async function calculateItemNetEligibleRefund({
  prisma,
  orderId,
  orderItemId = null,
  requestedRefundAmount = null
}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payments: true
    }
  })

  if (!order) {
    throw new Error(`Order ${orderId} not found`)
  }

  const targetItem = orderItemId
    ? order.items.find((item) => item.id === orderItemId)
    : null

  const capturedPayment = order.payments?.find(
    (p) => p.status === 'SUCCESS' || p.status === 'REFUNDED' || p.status === 'REFUND_PENDING'
  )
  const capturedAmount = Number(order.paidAmount || order.totalAmount || 0)

  // Fetch previous refunds (gateway + wallet) logged for this order
  const previousRefunds = await prisma.refundTransaction.findMany({
    where: { orderId, status: 'SUCCEEDED' }
  })
  const totalPreviousGatewayRefunded = previousRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0)

  const previousWalletCredits = await prisma.walletTransaction.findMany({
    where: { referenceId: orderId, type: 'CREDIT' }
  })
  const totalPreviousWalletCredits = previousWalletCredits.reduce((sum, w) => sum + Number(w.amount || 0), 0)

  const totalPreviousRefunded = totalPreviousGatewayRefunded + totalPreviousWalletCredits

  // Calculate order-level ceiling
  const nonRefundableFees = Number(order.shippingFee || 0) + Number(order.convenienceFee || 0)
  const maxRemainingOrderCeiling = Math.max(0, capturedAmount - nonRefundableFees - totalPreviousRefunded)

  // Item-level paid amount calculation (factoring item quantity & allocated discounts)
  let itemPaidValue = capturedAmount
  if (targetItem) {
    const totalItemsValue = order.items.reduce((sum, i) => sum + Number(i.totalPrice || i.price * i.quantity || 0), 0)
    const itemRawPrice = Number(targetItem.totalPrice || targetItem.price * targetItem.quantity || 0)
    const itemShareRatio = totalItemsValue > 0 ? itemRawPrice / totalItemsValue : 1 / (order.items.length || 1)
    
    // Allocate order-level discounts/coupons proportionally
    const totalOrderDiscount = Number(order.discountAmount || 0) + Number(order.couponDiscount || 0)
    itemPaidValue = Math.max(0, itemRawPrice - totalOrderDiscount * itemShareRatio)
  }

  // Calculate Net Eligible Refund using mathematically safe formula
  const attemptedAmount = requestedRefundAmount != null ? Number(requestedRefundAmount) : itemPaidValue
  const netEligibleRefund = Math.max(
    0,
    Math.min(attemptedAmount, itemPaidValue, maxRemainingOrderCeiling)
  )

  return {
    orderId,
    orderItemId: targetItem?.id || null,
    capturedAmount,
    totalPreviousRefunded,
    nonRefundableFees,
    maxRemainingOrderCeiling,
    itemPaidValue,
    attemptedAmount,
    netEligibleRefund,
    payment: capturedPayment || null
  }
}

/**
 * Executes refund resolution by branching to WALLET or ORIGINAL_PAYMENT.
 */
export async function executeFinancialResolution({
  prisma,
  orderId,
  orderItemId = null,
  refundPreference = 'ORIGINAL_PAYMENT',
  requestedAmount = null,
  requestedBy = null,
  reason = 'OMS Resolution Refund',
  idempotencyKey = null
}) {
  const calculation = await calculateItemNetEligibleRefund({
    prisma,
    orderId,
    orderItemId,
    requestedRefundAmount: requestedAmount
  })

  const { netEligibleRefund, payment } = calculation
  const key = idempotencyKey || `oms_fin_res:${orderId}:${orderItemId || 'all'}:${refundPreference}`

  if (netEligibleRefund <= 0) {
    logger.warn('[FinancialOrchestrator] Net eligible refund evaluated to 0', { orderId, calculation })
    return { ok: true, refundAmount: 0, reason: 'Eligible refund amount is ₹0' }
  }

  if (refundPreference === 'WALLET') {
    return await executeAtomicWalletCredit({
      prisma,
      userId: payment?.userId || calculation.orderId,
      amount: netEligibleRefund,
      referenceId: orderId,
      idempotencyKey: key,
      reason
    })
  }

  // Route to Gateway Execution Layer
  if (!payment) {
    throw new Error(`No valid payment record found for order ${orderId}`)
  }

  return await orchestrateOnlineRefund({
    prisma,
    payment,
    orderId,
    orderNumber: payment.orderNumber || null,
    reason,
    requestedBy,
    idempotencyKey: key,
    refundAmountRupees: netEligibleRefund
  })
}

/**
 * Executes atomic wallet balance increment and transaction logging inside prisma.$transaction.
 */
export async function executeAtomicWalletCredit({
  prisma,
  userId,
  amount,
  referenceId,
  idempotencyKey,
  reason = 'Refund Credit'
}) {
  return await prisma.$transaction(async (tx) => {
    // Check idempotency first
    const existingTx = await tx.walletTransaction.findUnique({
      where: { idempotencyKey }
    })

    if (existingTx) {
      logger.info('[WalletEngine] Duplicate wallet credit prevented via idempotency key', { idempotencyKey })
      return { ok: true, replay: true, walletTransactionId: existingTx.id, amount: existingTx.amount }
    }

    // Upsert customer wallet balance
    const wallet = await tx.wallet.upsert({
      where: { userId },
      create: {
        userId,
        balance: amount,
        currency: 'INR'
      },
      update: {
        balance: { increment: amount }
      }
    })

    // Create wallet transaction record
    const walletTx = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type: 'CREDIT',
        referenceId,
        idempotencyKey
      }
    })

    logger.info('[WalletEngine] Atomic wallet credit completed', {
      userId,
      amount,
      walletId: wallet.id,
      transactionId: walletTx.id
    })

    return { ok: true, replay: false, walletTransactionId: walletTx.id, amount }
  })
}
