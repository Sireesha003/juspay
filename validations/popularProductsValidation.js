// validations/popularProductsValidation.js
import { query } from 'express-validator';

/**
 * Validation for popular products endpoint
 */

// GET endpoint validation (query parameters)
export const popularProductsQueryValidation = [
  query('pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^\d{5,6}$/)
    .withMessage('Pincode must be 5 or 6 digits'),
  
  query('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  query('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt()
];

