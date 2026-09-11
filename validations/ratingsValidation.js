// validations/ratingsValidation.js
import { body, param, query } from 'express-validator'

/**
 * Validation for product ID parameter
 */
export const productIdValidation = [
  param('productId')
    .notEmpty()
    .withMessage('Product ID is required')
]

/**
 * Validation for rating ID parameter
 */
export const ratingIdValidation = [
  param('ratingId')
    .notEmpty()
    .withMessage('Rating ID is required')
    .isUUID()
    .withMessage('Rating ID must be a valid UUID')
]

/**
 * Validation for adding/updating rating
 */
export const addRatingValidation = [
  ...productIdValidation,
  body('rating')
    .notEmpty()
    .withMessage('Rating is required')
    .isFloat({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('review')
    .optional()
    .isString()
    .withMessage('Review must be a string')
    .isLength({ max: 1000 })
    .withMessage('Review must not exceed 1000 characters')
]

/**
 * Validation for updating rating
 */
export const updateRatingValidation = [
  ...ratingIdValidation,
  body('rating')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('review')
    .optional()
    .isString()
    .withMessage('Review must be a string')
    .isLength({ max: 1000 })
    .withMessage('Review must not exceed 1000 characters')
]

/**
 * Validation for getting product ratings
 */
export const getProductRatingsValidation = [
  ...productIdValidation,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
]

/**
 * Validation for getting user ratings
 */
export const getUserRatingsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
]

