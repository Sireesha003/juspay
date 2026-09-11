// validations/returnsValidation.js
import { body, param, query } from 'express-validator'

/**
 * Validation for order ID parameter
 */
export const orderIdValidation = [
  param('orderId')
    .notEmpty()
    .withMessage('Order ID is required')
    .isUUID()
    .withMessage('Order ID must be a valid UUID')
]

/**
 * Validation for return ID parameter
 */
export const returnIdValidation = [
  param('returnId')
    .notEmpty()
    .withMessage('Return ID is required')
    .isUUID()
    .withMessage('Return ID must be a valid UUID')
]

/**
 * Validation for initiating return
 */
export const initiateReturnValidation = [
  ...orderIdValidation,
  body('reason')
    .notEmpty()
    .withMessage('Return reason is required')
    .isString()
    .withMessage('Reason must be a string')
    .isLength({ min: 5, max: 500 })
    .withMessage('Reason must be between 5 and 500 characters'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
  body('evidence')
    .optional()
    .isArray()
    .withMessage('Evidence must be an array of image URLs'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item must be selected for return'),
  body('items.*.orderItemId')
    .notEmpty()
    .withMessage('Order item ID is required')
    .isUUID()
    .withMessage('Order item ID must be a valid UUID'),
  body('items.*.quantity')
    .notEmpty()
    .withMessage('Quantity is required')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer')
]

/**
 * Validation for getting user returns
 */
export const getUserReturnsValidation = [
  query('status')
    .optional()
    .isIn(['PENDING', 'APPROVED', 'REJECTED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'REFUNDED', 'CANCELLED'])
    .withMessage('Invalid return status'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
]

