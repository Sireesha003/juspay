// controllers/notificationsController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

/**
 * Format notification for response
 */
function formatNotification(notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: notification.data,
    channel: notification.channel,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
    readAt: notification.readAt
  }
}

/**
 * GET /api/v1/notifications
 * Get user's notifications
 */
export const getNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { isRead, type, page: pageParam, limit: limitParam } = req.query

  // Validate and constrain pagination parameters
  const pageNum = Math.max(1, parseInt(pageParam) || 1)
  const limitNum = Math.min(
    Math.max(1, parseInt(limitParam) || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  )

  logger.info('[Notifications] Fetching notifications', { userId, isRead, type, page: pageNum, limit: limitNum })

  const where = {
    userId
  }

  if (isRead !== undefined) {
    where.isRead = isRead === 'true' || isRead === true
  }

  if (type) {
    where.type = type
  }

  const total = await prisma.notification.count({ where })

  const skip = (pageNum - 1) * limitNum
  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip,
    take: limitNum
  })

  const formattedNotifications = notifications.map(formatNotification)
  const totalPages = Math.ceil(total / limitNum)

  return successResponse(res, 200, {
    notifications: formattedNotifications,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    },
    unreadCount: await prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    })
  }, 'Notifications fetched successfully')
})

/**
 * GET /api/v1/notifications/:notificationId
 * Get notification details
 */
export const getNotificationById = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { notificationId } = req.params

  logger.info('[Notifications] Fetching notification', { userId, notificationId })

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId }
  })

  if (!notification) {
    return errorResponse(res, 404, 'Notification not found')
  }

  if (notification.userId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  return successResponse(res, 200, { notification: formatNotification(notification) }, 'Notification fetched successfully')
})

/**
 * PATCH /api/v1/notifications/:notificationId/read
 * Mark notification as read
 */
export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { notificationId } = req.params

  logger.info('[Notifications] Marking notification as read', { userId, notificationId })

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId }
  })

  if (!notification) {
    return errorResponse(res, 404, 'Notification not found')
  }

  if (notification.userId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  if (notification.isRead) {
    return successResponse(res, 200, { notification: formatNotification(notification) }, 'Notification already marked as read')
  }

  const updatedNotification = await prisma.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date()
    }
  })

  logger.info('[Notifications] Notification marked as read', { userId, notificationId })

  return successResponse(res, 200, { notification: formatNotification(updatedNotification) }, 'Notification marked as read successfully')
})

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id

  logger.info('[Notifications] Marking all notifications as read', { userId })

  const result = await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  })

  logger.info('[Notifications] All notifications marked as read', {
    userId,
    count: result.count
  })

  return successResponse(res, 200, {
    updatedCount: result.count
  }, `${result.count} notifications marked as read successfully`)
})

/**
 * GET /api/v1/notifications/unread-count
 * Get unread notification count
 */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user.id

  const count = await prisma.notification.count({
    where: {
      userId,
      isRead: false
    }
  })

  return successResponse(res, 200, { unreadCount: count }, 'Unread count fetched successfully')
})

