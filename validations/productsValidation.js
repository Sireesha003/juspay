// validations/productsValidation.js
import { query } from 'express-validator';

/**
 * Validation for products endpoints
 * Common query parameters for category and subcategory product listings
 */

// Common query validation for products endpoints
export const productsQueryValidation = [
  query('pincode')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Pincode cannot be empty if provided')
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
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  
  query('search')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Search term must be less than 200 characters'),
  
  query('query')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Query must be between 1 and 200 characters'),
  
  query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Query must be between 1 and 200 characters'),
  
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('minPrice must be 0 or greater')
    .toFloat(),
  
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('maxPrice must be 0 or greater')
    .toFloat(),
  
  query('brand')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Brand must be less than 100 characters'),
  
  query('inStock')
    .optional()
    .isBoolean()
    .withMessage('inStock must be a boolean')
    .toBoolean(),
  
  query('isFeatured')
    .optional()
    .isBoolean()
    .withMessage('isFeatured must be a boolean')
    .toBoolean(),
  
  query('sortBy')
    .optional()
    .isIn(['price', 'name', 'createdAt', 'rating', 'price_desc', 'price_asc'])
    .withMessage('sortBy must be one of: price, name, createdAt, rating, price_desc, price_asc'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sortOrder must be either asc or desc'),

  query('tag')
    .optional()
    .trim()
    .isString()
    .withMessage('tag must be a string')
];

