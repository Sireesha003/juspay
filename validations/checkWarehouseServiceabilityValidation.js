// validations/checkWarehouseServiceabilityValidation.js
import { body } from 'express-validator'

/**
 * POST /api/v1/check-serviceability
 * Body: pincode, userId, warehouseId
 */
export const checkWarehouseServiceabilityValidation = [
  body('pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^\d{5,6}$/)
    .withMessage('Pincode must be 5 or 6 digits'),

  body('userId')
    .trim()
    .notEmpty()
    .withMessage('userId is required')
    .isUUID('4')
    .withMessage('userId must be a valid UUID'),

  body('warehouseId')
    .trim()
    .notEmpty()
    .withMessage('warehouseId is required')
    .isUUID('4')
    .withMessage('warehouseId must be a valid UUID'),
]
