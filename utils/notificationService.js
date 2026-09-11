// utils/notificationService.js
import { prisma } from '../config/prismaClient.js'
import logger from './logger.js'
import { sendPushNotification } from './notificationUtils.js'

/**
 * Create and send notification
 */
export async function createNotification(userId, type, title, message, data = null, channels = ['push', 'in_app']) {
  try {
    // Create notification in database
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data: data || null,
        channel: channels
      }
    })

    logger.info('[NotificationService] Notification created', {
      notificationId: notification.id,
      userId,
      type
    })

    // Send push notification if channel includes 'push'
    if (channels.includes('push')) {
      try {
        // Get user's device tokens
        const deviceTokens = await prisma.deviceToken.findMany({
          where: { userId },
          select: { deviceToken: true }
        })

        // Send push notification to all devices
        let sentCount = 0
        let failedCount = 0
        for (const device of deviceTokens) {
          try {
            const result = await sendPushNotification(
              device.deviceToken,
              title,
              message,
              data || {},
              userId
            )
            if (result && result.success) {
              sentCount++
              logger.info('[NotificationService] Push notification sent', {
                userId,
                deviceToken: device.deviceToken.substring(0, 20) + '...',
                messageId: result.messageId
              })
            } else {
              failedCount++
              logger.warn('[NotificationService] Push notification failed', {
                userId,
                deviceToken: device.deviceToken.substring(0, 20) + '...',
                error: result?.error
              })
            }
          } catch (error) {
            failedCount++
            logger.error('[NotificationService] Error sending push notification', {
              error: error.message,
              userId,
              deviceToken: device.deviceToken.substring(0, 20) + '...'
            })
          }
        }

        // Update notification with delivery status
        if (deviceTokens.length > 0) {
          await prisma.notification.update({
            where: { id: notification.id },
            data: {
              data: {
                ...(notification.data || {}),
                deliveryStatus: {
                  totalDevices: deviceTokens.length,
                  sent: sentCount,
                  failed: failedCount,
                  timestamp: new Date().toISOString()
                }
              }
            }
          })
        }
      } catch (error) {
        logger.error('[NotificationService] Error getting device tokens', {
          error: error.message,
          userId
        })
      }
    }

    return notification
  } catch (error) {
    logger.error('[NotificationService] Error creating notification', {
      error: error.message,
      userId,
      type
    })
    throw error
  }
}

/**
 * Send order status notification
 */
export async function sendOrderNotification(userId, order, status) {
  // Order lifecycle notifications are centralized in delivery-api.
  const ENABLE_LOCAL_ORDER_NOTIFICATIONS = false
  if (!ENABLE_LOCAL_ORDER_NOTIFICATIONS) return

  const notifications = {
    PLACED: {
      type: 'ORDER_CREATED',
      title: 'Order Placed',
      message: `Your order ${order.orderNumber} has been placed successfully.`
    },
    PENDING: {
      type: 'ORDER_CREATED',
      title: 'Order Placed',
      message: `Your order ${order.orderNumber} has been placed successfully.`
    },
    CONFIRMED: {
      type: 'ORDER_CONFIRMED',
      title: 'Order Confirmed',
      message: `Your order ${order.orderNumber} has been confirmed.`
    },
    PROCESSING: {
      type: 'ORDER_PROCESSING',
      title: 'Order Processing',
      message: `Your order ${order.orderNumber} is being processed.`
    },
    READY_FOR_PICKUP: {
      type: 'ORDER_READY',
      title: 'Order Ready',
      message: `Your order ${order.orderNumber} is ready for pickup.`
    },
    ASSIGNED_TO_AGENT: {
      type: 'DELIVERY_ASSIGNED',
      title: 'Delivery Assigned',
      message: `Delivery agent has been assigned for your order ${order.orderNumber}.`
    },
    OUT_FOR_DELIVERY: {
      type: 'DELIVERY_ASSIGNED',
      title: 'Out for delivery',
      message: `Your order ${order.orderNumber} is out for delivery.`
    },
    PICKED_UP: {
      type: 'ORDER_PICKED_UP',
      title: 'Order Picked Up',
      message: `Your order ${order.orderNumber} has been picked up.`
    },
    IN_TRANSIT: {
      type: 'ORDER_PICKED_UP',
      title: 'Order In Transit',
      message: `Your order ${order.orderNumber} is on the way.`
    },
    DELIVERED: {
      type: 'ORDER_DELIVERED',
      title: 'Order Delivered',
      message: `Your order ${order.orderNumber} has been delivered successfully.`
    },
    CANCELLED: {
      type: 'ORDER_CANCELLED',
      title: 'Order Cancelled',
      message: `Your order ${order.orderNumber} has been cancelled.`
    }
  }

  const notificationConfig = notifications[status]
  if (!notificationConfig) {
    logger.warn('[NotificationService] Unknown order status', { status })
    return
  }

  await createNotification(
    userId,
    notificationConfig.type,
    notificationConfig.title,
    notificationConfig.message,
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: status
    }
  )
}

/**
 * Send payment notification
 */
export async function sendPaymentNotification(userId, order, paymentStatus) {
  if (paymentStatus === 'SUCCESS') {
    await createNotification(
      userId,
      'PAYMENT_SUCCESS',
      'Payment Successful',
      `Payment of ₹${order.totalAmount} for order ${order.orderNumber} was successful.`,
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.totalAmount
      }
    )
  } else if (paymentStatus === 'FAILED') {
    await createNotification(
      userId,
      'PAYMENT_FAILED',
      'Payment Failed',
      `Payment for order ${order.orderNumber} failed. Please try again.`,
      {
        orderId: order.id,
        orderNumber: order.orderNumber
      }
    )
  }
}

