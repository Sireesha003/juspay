// validations/deliveryValidation.js
import { body } from 'express-validator'

/**
 * Validation for delivery endpoints.
 * Slots: use slotsAvailabilityValidation from ordersValidation.js (warehouseId + date).
 */

// Validation for calculating delivery charge
export const deliveryChargeValidation = [
  body('pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^\d{5,6}$/)
    .withMessage('Pincode must be 5 or 6 digits'),

  body('subtotal')
    .notEmpty()
    .withMessage('Subtotal is required')
    .isFloat({ min: 0 })
    .withMessage('Subtotal must be a positive number')
    .toFloat(),

  body('warehouseId')
    .optional()
    .trim()
    .isUUID()
    .withMessage('Warehouse ID must be a valid UUID'),

  body('latitude')
    .optional()
    .trim()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90')
    .toFloat(),

  body('longitude')
    .optional()
    .trim()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
    .toFloat()
]

