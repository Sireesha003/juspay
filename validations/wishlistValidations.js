// validations/wishlistValidation.js
import { body, param } from 'express-validator';

export const wishlistItemValidation = [

  body('warehouseId')
    .trim()
    .notEmpty()
    .withMessage('Warehouse ID is required')
    .isUUID()
    .withMessage('Warehouse ID must be a valid UUID'),

  body('productId')
    .trim()
    .notEmpty()
    .withMessage('Product ID is required'),

  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE'])
    .withMessage('Status must be either ACTIVE or INACTIVE'),
];

export const wishlistArrayValidation = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array'),

  body('items.*.warehouseId')
    .trim()
    .notEmpty()
    .isUUID()
    .withMessage('Invalid warehouseId'),

  body('items.*.productId')
    .trim()
    .notEmpty()
    .isUUID()
    .withMessage('Invalid productId'),

  body('items.*.status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE'])
    .withMessage('Invalid status'),
];

export const wishlistIdValidation = [
  param('wishlistId')
    .trim()
    .notEmpty()
    .withMessage('Wishlist ID is required')
    .isUUID()
    .withMessage('Wishlist ID must be a valid UUID'),
];

export const productIdParamValidation = [
  param('productId')
    .trim()
    .notEmpty()
    .withMessage('Product ID is required'),
];
