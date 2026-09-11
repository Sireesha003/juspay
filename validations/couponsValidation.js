// validations/couponsValidation.js
import { query } from 'express-validator';

/**
 * Validation for coupons endpoint
 */

// GET /api/v1/coupons - Home page coupons (cartValue optional)
export const couponsQueryValidation = [
  query('userId')
    .optional()
    .isUUID('4')
    .withMessage('userId must be a valid UUID')
    .custom((value) => {
      if (value === '') return true;
      return true;
    }),
  
  query('pincode')
    .optional()
    .trim()
    .matches(/^\d{5,6}$/)
    .withMessage('Pincode must be 5 or 6 digits')
    .custom((value) => {
      if (value === '') return true;
      return true;
    }),
  
  query('warehouseId')
    .optional()
    .trim()
    .isUUID()
    .withMessage('warehouseId must be a valid UUID'),

  query('storeId')
    .optional()
    .trim()
    .isUUID()
    .withMessage('storeId must be a valid UUID'),

  query('cartValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('cartValue must be 0 or greater')
];

// GET /api/v1/coupons/cart - Cart page coupons
export const couponsCartQueryValidation = [
  query('userId')
    .optional()
    .isUUID('4')
    .withMessage('userId must be a valid UUID')
    .custom((value) => {
      if (value === '') return true;
      return true;
    }),
  
  query('pincode')
    .optional()
    .trim()
    .matches(/^\d{5,6}$/)
    .withMessage('Pincode must be 5 or 6 digits')
    .custom((value) => {
      if (value === '') return true;
      return true;
    }),
  
  query('warehouseId')
    .optional()
    .trim()
    .isUUID()
    .withMessage('warehouseId must be a valid UUID'),

  query('storeId')
    .optional()
    .trim()
    .isUUID()
    .withMessage('storeId must be a valid UUID'),

  query('cartValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('cartValue must be 0 or greater')
];

