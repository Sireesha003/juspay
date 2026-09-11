// validations/notificationsValidation.js
import { param, query } from 'express-validator';

/**
 * Validation for notification endpoints
 */

// Validation for notification ID parameter
export const notificationIdValidation = [
  param('notificationId')
    .trim()
    .notEmpty()
    .withMessage('Notification ID is required')
    .isUUID()
    .withMessage('Notification ID must be a valid UUID'),
];

// Validation for notification listing query
export const notificationListValidation = [
  query('isRead')
    .optional()
    .isBoolean()
    .withMessage('isRead must be a boolean')
    .toBoolean(),
  
  query('type')
    .optional()
    .isIn(['ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_PROCESSING', 'ORDER_READY', 'ORDER_PICKED_UP', 'ORDER_DELIVERED', 'ORDER_CANCELLED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'DELIVERY_ASSIGNED', 'CHAT_MESSAGE', 'PROMOTION', 'LOW_STOCK', 'SYSTEM_ALERT'])
    .withMessage('Invalid notification type'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
];

