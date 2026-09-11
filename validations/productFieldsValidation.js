// validations/productFieldsValidation.js
import { body } from 'express-validator';

/**
 * Validation rules for new Product fields
 * These validations ensure data quality for newly introduced schema fields
 */

/**
 * Validation for Product slug field
 * Slug must be URL-safe and unique (enforced at database level)
 */
export const validateSlug = [
  body('slug')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Slug must be between 1 and 255 characters')
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage('Slug must be URL-safe (lowercase letters, numbers, and hyphens only)')
];

/**
 * Validation for Product order quantity limits
 */
export const validateOrderQuantityLimits = [
  body('minOrderQty')
    .optional()
    .isInt({ min: 1 })
    .withMessage('minOrderQty must be a positive integer')
    .toInt(),
  
  body('maxOrderQty')
    .optional()
    .isInt({ min: 1 })
    .withMessage('maxOrderQty must be a positive integer')
    .toInt(),
  
  body()
    .custom((value) => {
      // Validate minOrderQty < maxOrderQty if both are provided
      if (value.minOrderQty && value.maxOrderQty) {
        if (value.minOrderQty > value.maxOrderQty) {
          throw new Error('minOrderQty must be less than or equal to maxOrderQty');
        }
      }
      return true;
    })
];

/**
 * Validation for Product discount fields
 */
export const validateDiscountFields = [
  body('discountType')
    .optional()
    .isIn(['PERCENTAGE', 'FLAT'])
    .withMessage('discountType must be either PERCENTAGE or FLAT'),
  
  body('discountValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('discountValue must be 0 or greater')
    .toFloat(),
  
  body()
    .custom((value) => {
      // If discountType is PERCENTAGE, discountValue should be <= 100
      if (value.discountType === 'PERCENTAGE' && value.discountValue) {
        if (value.discountValue > 100) {
          throw new Error('discountValue cannot exceed 100 for PERCENTAGE discount type');
        }
      }
      // If discountType is FLAT, discountValue should not exceed price
      if (value.discountType === 'FLAT' && value.discountValue && value.price) {
        if (value.discountValue > value.price) {
          throw new Error('FLAT discountValue cannot exceed product price');
        }
      }
      return true;
    })
];

/**
 * Validation for Product variant fields
 */
export const validateVariantFields = [
  body('variantName')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('variantName must be less than 255 characters'),
  
  body('sku')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('SKU must be between 1 and 100 characters')
    .matches(/^[A-Z0-9\-_]+$/)
    .withMessage('SKU must contain only uppercase letters, numbers, hyphens, and underscores'),
  
  body('barcode')
    .optional()
    .trim()
    .isLength({ min: 8, max: 50 })
    .withMessage('Barcode must be between 8 and 50 characters')
    .matches(/^[0-9]+$/)
    .withMessage('Barcode must contain only numbers')
];

/**
 * Validation for Product SEO fields
 */
export const validateSEOFields = [
  body('metaTitle')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('metaTitle must be less than 255 characters'),
  
  body('metaDescription')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('metaDescription must be less than 500 characters'),
  
  body('metaKeywords')
    .optional()
    .custom((value) => {
      if (Array.isArray(value)) {
        if (value.length > 20) {
          throw new Error('metaKeywords array cannot exceed 20 items');
        }
        // Validate each keyword
        for (const keyword of value) {
          if (typeof keyword !== 'string' || keyword.length > 50) {
            throw new Error('Each metaKeyword must be a string with max 50 characters');
          }
        }
      }
      return true;
    }),
  
  body('shortDescription')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('shortDescription must be less than 500 characters')
];

/**
 * Validation for Product settings fields
 */
export const validateProductSettings = [
  body('isReturnable')
    .optional()
    .isBoolean()
    .withMessage('isReturnable must be a boolean')
    .toBoolean(),
  
  body('isCancelable')
    .optional()
    .isBoolean()
    .withMessage('isCancelable must be a boolean')
    .toBoolean(),
  
  body('isCodAllowed')
    .optional()
    .isBoolean()
    .withMessage('isCodAllowed must be a boolean')
    .toBoolean()
];

/**
 * Validation for Product measurement fields
 */
export const validateMeasurementFields = [
  body('unitType')
    .optional()
    .isIn(['Weight', 'Pack', 'Piece', 'Volume', 'Length', 'Area'])
    .withMessage('unitType must be one of: Weight, Pack, Piece, Volume, Length, Area'),
  
  body('measurement')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('measurement must be less than 50 characters')
    .matches(/^[\d.]+(kg|g|ml|l|m|cm|piece|pack|box|set|pair|dozen)$/i)
    .withMessage('measurement must be in format like "1kg", "500g", "1L", "1piece"')
];

/**
 * Combined validation for all new Product fields
 * Use this when creating or updating products with new fields
 */
export const validateNewProductFields = [
  ...validateSlug,
  ...validateOrderQuantityLimits,
  ...validateDiscountFields,
  ...validateVariantFields,
  ...validateSEOFields,
  ...validateProductSettings,
  ...validateMeasurementFields
];
