import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'

// Simple helper to calculate the next delivery date
function getNextDeliveryDate(frequency, currentDate) {
  const date = new Date(currentDate)
  date.setHours(8, 0, 0, 0)
  
  if (frequency === 'DAILY') {
    date.setDate(date.getDate() + 1)
  } else if (frequency === 'WEEKLY') {
    date.setDate(date.getDate() + 7)
  } else {
    date.setDate(date.getDate() + 1)
  }
  return date
}

/**
 * Process all active subscriptions that are due for delivery
 */
async function processDueSubscriptions() {
  logger.info('[SubscriptionProcessor] Starting due subscriptions check...')
  const now = new Date()

  try {
    // Find active subscriptions that need delivery order creation
    const dueSubscriptions = await prisma.consumerSubscription.findMany({
      where: {
        status: 'ACTIVE',
        nextDelivery: {
          lte: now
        }
      },
      include: {
        Product: true,
        User: {
          select: { phone: true }
        }
      }
    })

    logger.info(`[SubscriptionProcessor] Found ${dueSubscriptions.length} due subscriptions`)

    for (const sub of dueSubscriptions) {
      try {
        // Find default address for the user
        const defaultAddress = await prisma.address.findFirst({
          where: { userId: sub.userId, isDefault: true }
        })

        if (!defaultAddress) {
          logger.warn(`[SubscriptionProcessor] Skipping subscription ${sub.id}: No default address found for user ${sub.userId}`)
          continue
        }

        // Calculate pricing
        const price = sub.product.finalPrice || sub.product.price
        const totalAmount = Math.round(price * sub.quantity * 100) / 100

        // Create the order locally with a deterministic, unique order number mapping to the scheduled date
        const scheduledDateStr = new Date(sub.nextDelivery).toISOString().split('T')[0]
        const orderNumber = `SUB-${sub.id.slice(0, 8).toUpperCase()}-${scheduledDateStr}`
        const nextDelivery = getNextDeliveryDate(sub.frequency, sub.nextDelivery)
        
        const isClaimed = await prisma.$transaction(async (tx) => {
          // Optimistically update nextDelivery date to claim the slot.
          // If another cluster instance processed it, the nextDelivery matches no rows and returns count = 0.
          const claimed = await tx.consumerSubscription.updateMany({
            where: {
              id: sub.id,
              status: 'ACTIVE',
              nextDelivery: sub.nextDelivery
            },
            data: { nextDelivery }
          })

          if (claimed.count === 0) {
            return false
          }

          // 1. Create order
          const order = await tx.order.create({
            data: {
              orderNumber,
              consumerId: sub.userId,
              addressId: defaultAddress.id,
              warehouseId: sub.product.warehouseId,
              deliveryType: 'SCHEDULED',
              totalAmount,
              status: 'PENDING'
            }
          })

          // 2. Create order item
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: sub.productId,
              quantity: sub.quantity,
              unit: sub.product.unit || 'PIECE',
              unitPrice: price,
              totalPrice: totalAmount,
              productName: sub.product.name
            }
          })

          return true
        })

        if (!isClaimed) {
          logger.info(`[SubscriptionProcessor] Subscription ${sub.id} already processed/claimed by another cluster instance. Skipping.`)
          continue
        }

        logger.info(`[SubscriptionProcessor] Successfully processed subscription ${sub.id} -> Order ${orderNumber}`)
      } catch (err) {
        logger.error(`[SubscriptionProcessor] Failed to process subscription ${sub.id}`, { error: err.message })
      }
    }
  } catch (error) {
    logger.error('[SubscriptionProcessor] Global error in subscription runner', { error: error.message })
  }
}

// Run the subscription processor every 6 hours
const SIX_HOURS = 6 * 60 * 60 * 1000
setInterval(processDueSubscriptions, SIX_HOURS)

// Run once immediately on startup
setTimeout(processDueSubscriptions, 5000)
