// validations/addressesValidation.js
import { body, param } from 'express-validator';

/**
 * Validation for address endpoints
 */

const MAX_ADDRESSES = 5

// Validation for creating/updating address
export const addressBodyValidation = [
  body('label')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Label must be less than 50 characters'),
  
  body('line1')
    .trim()
    .notEmpty()
    .withMessage('Address line 1 is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Address line 1 must be between 5 and 200 characters'),
  
  body('line2')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address line 2 must be less than 200 characters'),
  
  body('city')
    .trim()
    .notEmpty()
    .withMessage('City is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),
  
  body('state')
    .trim()
    .notEmpty()
    .withMessage('State is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),
  
  body('pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^\d{5,6}$/)
    .withMessage('Pincode must be 5 or 6 digits'),
  
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object')
    .custom((value) => {
      if (value && (value.lat === undefined || value.lng === undefined)) {
        throw new Error('Location must have lat and lng properties')
      }
      if (value && (typeof value.lat !== 'number' || typeof value.lng !== 'number')) {
        throw new Error('Location lat and lng must be numbers')
      }
      return true
    }),
  
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be a boolean')
    .toBoolean(),
];

// Validation for address ID parameter
export const addressIdValidation = [
  param('addressId')
    .trim()
    .notEmpty()
    .withMessage('Address ID is required')
    .isUUID()
    .withMessage('Address ID must be a valid UUID'),
];

