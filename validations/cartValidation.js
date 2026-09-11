// validations/cartValidation.js
import { body, param } from 'express-validator';

/**
 * Validation for cart endpoints
 */

// Validation for adding item to cart
export const addCartItemValidation = [
  body('productId')
    .custom((value, { req }) => {
      if (!req.body.bundleId && !value) {
        throw new Error('Product ID is required when bundle ID is not provided');
      }
      return true;
    }),
  body('productVariantId')
    .optional()
    .trim(),
  body('bundleId')
    .optional({ checkFalsy: true })
    .trim()
    .isUUID()
    .withMessage('Bundle ID must be a valid UUID'),
  body('quantity')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Quantity must be between 1 and 100')
    .toInt(),
  body('type')
    .optional()
    .isIn(['inc', 'dec'])
    .withMessage('Type must be inc or dec'),
];

// Validation for updating cart item
export const updateCartItemValidation = [
  param('itemId')
    .trim()
    .notEmpty()
    .withMessage('Item ID is required')
    .isUUID()
    .withMessage('Item ID must be a valid UUID'),
  
  body('quantity')
    .notEmpty()
    .withMessage('Quantity is required')
    .isInt({ min: 1, max: 100 })
    .withMessage('Quantity must be between 1 and 100')
    .toInt(),
];

// Validation for removing cart item
export const removeCartItemValidation = [
  param('itemId')
    .trim()
    .notEmpty()
    .withMessage('Item ID is required')
    .isUUID()
    .withMessage('Item ID must be a valid UUID'),
];

// Validation for applying coupon
export const applyCouponValidation = [
  body('couponCode')
    .trim()
    .notEmpty()
    .withMessage('Coupon code is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Coupon code must be between 3 and 50 characters'),
];

