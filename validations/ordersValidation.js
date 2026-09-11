// validations/ordersValidation.js
import { body, param, query } from 'express-validator';

/**
 * Validation for order endpoints
 */

// Validation for creating order (V1: warehouseId required; addressId required for FAST/SCHEDULED; optional for PICKUP_STORE)
export const createOrderValidation = [
  body('warehouseId')
    .trim()
    .notEmpty()
    .withMessage('Warehouse ID is required')
    .isUUID()
    .withMessage('Warehouse ID must be a valid UUID'),

  body('orderStatus')
    .optional()
    .trim()
    .isIn(['PENDING', 'PLACED', 'PAYMENT_FAILED', 'FAILED'])
    .withMessage('Order status must be PENDING, PLACED, PAYMENT_FAILED, or FAILED'),

  body('addressId')
    .optional()
    .trim()
    .isUUID()
    .withMessage('Address ID must be a valid UUID')
    .custom((value, { req }) => {
      const deliveryType = req.body?.deliveryType
      if (deliveryType !== 'PICKUP_STORE' && (!value || !String(value).trim())) {
        throw new Error('Address ID is required for FAST and SCHEDULED delivery')
      }
      return true
    }),
  
  body('deliverySlot')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Delivery slot must be less than 50 characters'),
  
  body('deliveryDate')
    .optional()
    .isISO8601()
    .withMessage('Delivery date must be a valid ISO 8601 date')
    .toDate(),
  
  body('specialInstructions')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Special instructions must be less than 500 characters'),
  
  body('couponCode')
    .optional()
    .trim()
    .custom((value) => {
      if (value === undefined || value === null || value === '') return true
      if (value.length >= 3 && value.length <= 50) return true
      throw new Error('Coupon code must be between 3 and 50 characters')
    }),
  
  body('deliveryType')
    .optional()
    .isIn(['FAST', 'SCHEDULED', 'PICKUP_STORE'])
    .withMessage('Delivery type must be FAST, SCHEDULED, or PICKUP_STORE'),
  
  body('pickupTimeSlot')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Pickup time slot must be less than 50 characters'),
];

// Validation for order ID parameter
export const orderIdValidation = [
  param('orderId')
    .trim()
    .notEmpty()
    .withMessage('Order ID is required')
    .isUUID()
    .withMessage('Order ID must be a valid UUID'),
];

// Validation for order ID + item ID (e.g. cancel order item)
export const orderIdItemIdValidation = [
  ...orderIdValidation,
  param('itemId')
    .trim()
    .notEmpty()
    .withMessage('Item ID is required')
    .isUUID()
    .withMessage('Item ID must be a valid UUID'),
];

// Validation for order listing query
export const orderListValidation = [
  query('status')
    .optional()
    .isIn(['PLACED', 'PENDING', 'PAYMENT_FAILED', 'CONFIRMED', 'PROCESSING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'RETURN_INITIATED', 'ASSIGNED_TO_AGENT', 'PICKUP_OTP_PENDING', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'])
    .withMessage('Invalid order status'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date')
    .toDate(),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .toDate(),

  query('scheduled')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('Scheduled must be "true" or "false"'),
];

// Validation for slots availability query (addressId / pincode optional for route filtering)
export const slotsAvailabilityValidation = [
  query('warehouseId')
    .trim()
    .notEmpty()
    .withMessage('Warehouse ID is required')
    .isUUID()
    .withMessage('Warehouse ID must be a valid UUID'),
  query('date')
    .trim()
    .notEmpty()
    .withMessage('Date is required')
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date'),
  query('addressId')
    .optional()
    .trim()
    .isUUID()
    .withMessage('addressId must be a valid UUID'),
  query('pincode')
    .optional()
    .trim()
    .matches(/^\d{5,6}$/)
    .withMessage('pincode must be 5 or 6 digits'),
];

// Validation for modifying order delivery
export const modifyDeliveryValidation = [
  body('deliverySlot')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Delivery slot must be less than 50 characters'),
  
  body('deliveryDate')
    .optional()
    .isISO8601()
    .withMessage('Delivery date must be a valid ISO 8601 date')
    .toDate()
    .custom((value) => {
      if (value && new Date(value) <= new Date()) {
        throw new Error('Delivery date must be in the future')
      }
      return true
    }),

  body('routeMapId')
    .optional()
    .isUUID()
    .withMessage('routeMapId must be a valid UUID'),
];

// Validation for updating delivery location
export const updateLocationValidation = [
  body('latitude')
    .notEmpty()
    .withMessage('Latitude is required')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90')
    .toFloat(),
  
  body('longitude')
    .notEmpty()
    .withMessage('Longitude is required')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
    .toFloat(),
  
  body('accuracy')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Accuracy must be a positive number')
    .toFloat(),
];

// Validation for modifying order items
export const modifyOrderItemsValidation = [
  body('items')
    .optional()
    .isArray()
    .withMessage('Items must be an array'),
  
  body('items.*.itemId')
    .optional()
    .isUUID()
    .withMessage('Item ID must be a valid UUID'),
  
  body('items.*.productId')
    .optional(),
  
  body('items.*.quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer')
    .toInt(),
  
  body('removeItems')
    .optional()
    .isArray()
    .withMessage('Remove items must be an array'),
  
  body('removeItems.*')
    .optional()
    .isUUID()
    .withMessage('Remove item ID must be a valid UUID'),
];

