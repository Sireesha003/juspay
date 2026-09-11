/**
 * Notifications API - Notification Management
 *
 * This router handles all notification-related operations including:
 * - Getting user's notifications
 * - Getting notification details
 * - Marking notifications as read
 * - Marking all notifications as read
 * - Getting unread count
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import notificationsRouter from './routes/notifications.router.js';
 *    app.use('/api/v1/notifications', notificationsRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import {
  notificationIdValidation,
  notificationListValidation
} from '../validations/notificationsValidation.js'
import {
  getNotifications,
  getNotificationById,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount
} from '../controllers/notificationsController.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const router = express.Router()

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors)
  }
  next()
}

// All notification routes require authentication
router.use(authMiddleware)

/**
 * GET /api/v1/notifications
 * Get user's notifications with filters
 */
router.get('/', notificationListValidation, validate, getNotifications)

/**
 * GET /api/v1/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', getUnreadCount)

/**
 * GET /api/v1/notifications/:notificationId
 * Get notification details
 */
router.get('/:notificationId', notificationIdValidation, validate, getNotificationById)

/**
 * PATCH /api/v1/notifications/:notificationId/read
 * Mark notification as read
 */
router.patch('/:notificationId/read', notificationIdValidation, validate, markNotificationAsRead)

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all notifications as read
 */
router.patch('/read-all', markAllNotificationsAsRead)

export default router

