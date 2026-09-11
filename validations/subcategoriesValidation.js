// validations/subcategoriesValidation.js
import { body, query } from 'express-validator';

/**
 * Validation for subcategories endpoints
 * Supports both POST (body) and GET (query) parameters
 */

// POST endpoint validation (body parameters)
export const subcategoriesBodyValidation = [
  body('pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^\d{5,6}$/)
    .withMessage('Pincode must be 5 or 6 digits'),
  
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  body('userId')
    .optional()
    .isUUID('4')
    .withMessage('userId must be a valid UUID')
    .custom((value) => {
      if (value === '') return true; // Allow empty string
      return true;
    })
];

// GET endpoint validation (query parameters)
export const subcategoriesQueryValidation = [
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
  
  query('userId')
    .optional()
    .isUUID('4')
    .withMessage('userId must be a valid UUID')
];

