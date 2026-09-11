// validations/chatValidation.js
import { body, param, query } from 'express-validator'

/**
 * Validation for sending a chat message
 */
export const sendMessageValidation = [
  body('receiverId')
    .notEmpty()
    .withMessage('Receiver ID is required')
    .isString()
    .withMessage('Receiver ID must be a string'),
  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .isString()
    .withMessage('Message must be a string')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters'),
  body('orderId')
    .optional()
    .isString()
    .withMessage('Order ID must be a string'),
  body('messageType')
    .optional()
    .isIn(['TEXT', 'IMAGE', 'AUDIO', 'LOCATION', 'ORDER_UPDATE'])
    .withMessage('Invalid message type'),
  body('mediaUrl')
    .optional()
    .isString()
    .isURL()
    .withMessage('Media URL must be a valid URL')
]

/**
 * Validation for message ID parameter
 */
export const messageIdValidation = [
  param('messageId')
    .notEmpty()
    .withMessage('Message ID is required')
    .isString()
    .withMessage('Message ID must be a string')
]

/**
 * Validation for order ID parameter
 */
export const orderIdValidation = [
  param('orderId')
    .notEmpty()
    .withMessage('Order ID is required')
    .isString()
    .withMessage('Order ID must be a string')
]

/**
 * Validation for conversations query
 */
export const conversationsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
]



