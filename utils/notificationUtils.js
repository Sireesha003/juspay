// utils/notificationUtils.js
import { admin, firebaseInitialized } from '../config/firebase.js'
import logger from './logger.js'
import { prisma } from '../config/prismaClient.js'

/**
 * Send push notification via Firebase Cloud Messaging
 * Returns success status and removes invalid tokens
 */
export const sendPushNotification = async (
  deviceToken,
  title,
  body,
  data = {},
  userId = null
) => {
  if (!firebaseInitialized) {
    logger.warn(
      '[NotificationUtils] Firebase not initialized - skipping push notification'
    )
    return { success: false, error: 'Firebase not initialized' }
  }

  try {
    // Convert data object to string format (FCM requires string values)
    const dataPayload = {}
    for (const [key, value] of Object.entries(data)) {
      dataPayload[key] = String(value)
    }

    const message = {
      token: deviceToken,
      notification: {
        title,
        body
      },
      data: dataPayload
    }

    const response = await admin.messaging().send(message)
    logger.info('[NotificationUtils] Push notification sent', {
      deviceToken: deviceToken.substring(0, 20) + '...',
      messageId: response
    })
    return { success: true, messageId: response }
  } catch (error) {
    logger.error('[NotificationUtils] Error sending push notification', {
      error: error.message,
      deviceToken: deviceToken ? deviceToken.substring(0, 20) + '...' : 'null',
      code: error.code
    })

    // Check if token is invalid and should be removed
    const invalidTokenErrors = [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
      'messaging/invalid-argument'
    ]

    if (invalidTokenErrors.includes(error.code) && userId) {
      try {
        // Remove invalid device token
        await prisma.deviceToken.deleteMany({
          where: {
            deviceToken,
            userId
          }
        })
        logger.info('[NotificationUtils] Removed invalid device token', {
          userId,
          deviceToken: deviceToken.substring(0, 20) + '...'
        })
      } catch (deleteError) {
        logger.error('[NotificationUtils] Error removing invalid token', {
          error: deleteError.message
        })
      }
    }

    return { success: false, error: error.message, code: error.code }
  }
}

/**
 * Cleanup invalid device tokens
 * Should be run periodically (e.g., daily cron job)
 */
export const cleanupInvalidDeviceTokens = async () => {
  try {
    // Get all device tokens
    const deviceTokens = await prisma.deviceToken.findMany({
      select: {
        id: true,
        deviceToken: true,
        userId: true
      }
    })

    logger.info('[NotificationUtils] Starting device token cleanup', {
      totalTokens: deviceTokens.length
    })

    let removedCount = 0
    for (const token of deviceTokens) {
      try {
        // Try to send a test message (dry run)
        // If it fails with invalid token error, remove it
        await admin.messaging().send({
          token: token.deviceToken,
          notification: {
            title: 'Test',
            body: 'Test'
          },
          dryRun: true // This doesn't actually send, just validates
        })
      } catch (error) {
        const invalidTokenErrors = [
          'messaging/invalid-registration-token',
          'messaging/registration-token-not-registered'
        ]

        if (invalidTokenErrors.includes(error.code)) {
          await prisma.deviceToken.delete({
            where: { id: token.id }
          })
          removedCount++
          logger.debug('[NotificationUtils] Removed invalid token', {
            tokenId: token.id,
            userId: token.userId
          })
        }
      }
    }

    logger.info('[NotificationUtils] Device token cleanup completed', {
      totalTokens: deviceTokens.length,
      removedCount
    })

    return { removedCount, totalTokens: deviceTokens.length }
  } catch (error) {
    logger.error('[NotificationUtils] Error during token cleanup', {
      error: error.message
    })
    throw error
  }
}
