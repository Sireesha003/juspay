// validations/paymentsValidation.js
import { body, param } from 'express-validator';

/**
 * Validation for payment endpoints
 */

// Validation for initiating payment
export const initiatePaymentValidation = [
  body('orderId')
    .trim()
    .notEmpty()
    .withMessage('Order ID is required')
    .isUUID()
    .withMessage('Order ID must be a valid UUID'),
  
  body('method')
    .trim()
    .notEmpty()
    .withMessage('Payment method is required')
    .isIn([
      'COD',
      'RAZORPAY_UPI',
      'RAZORPAY_CARD',
      'RAZORPAY_NETBANKING',
      'WALLET',
      'JUSPAY',
      'JUSPAY_UPI',
      'JUSPAY_CARD',
      'JUSPAY_NETBANKING'
    ])
    .withMessage('Invalid payment method'),
];

// Validation for verifying payment
export const verifyPaymentValidation = [
  body('orderId')
    .trim()
    .notEmpty()
    .withMessage('Order ID is required')
    .isUUID()
    .withMessage('Order ID must be a valid UUID'),

  body('paymentStatus')
    .optional()
    .trim()
    .toUpperCase()
    .isIn(['SUCCESS', 'FAILED'])
    .withMessage('paymentStatus must be either SUCCESS or FAILED'),

  body('status')
    .optional()
    .trim()
    .toUpperCase()
    .isIn(['SUCCESS', 'FAILED'])
    .withMessage('status must be either SUCCESS or FAILED'),

  body()
    .custom((value) => {
      const paymentStatus = String(
        value.paymentStatus || value.status || 'SUCCESS'
      )
        .trim()
        .toUpperCase()

      if (!['SUCCESS', 'FAILED'].includes(paymentStatus)) {
        throw new Error('Invalid payment status')
      }

      return true
    }),

  /**
   * Required only for SUCCESS payment verification
   */
  body('razorpayOrderId')
    .if((value, { req }) => {
      const paymentStatus = String(
        req.body.paymentStatus || req.body.status || 'SUCCESS'
      )
        .trim()
        .toUpperCase()

      return paymentStatus === 'SUCCESS'
    })
    .trim()
    .notEmpty()
    .withMessage('Razorpay order ID is required for successful payment verification'),

  body('razorpayPaymentId')
    .if((value, { req }) => {
      const paymentStatus = String(
        req.body.paymentStatus || req.body.status || 'SUCCESS'
      )
        .trim()
        .toUpperCase()

      return paymentStatus === 'SUCCESS'
    })
    .trim()
    .notEmpty()
    .withMessage('Razorpay payment ID is required for successful payment verification'),

  body('razorpaySignature')
    .if((value, { req }) => {
      const paymentStatus = String(
        req.body.paymentStatus || req.body.status || 'SUCCESS'
      )
        .trim()
        .toUpperCase()

      return paymentStatus === 'SUCCESS'
    })
    .trim()
    .notEmpty()
    .withMessage('Razorpay signature is required for successful payment verification'),

  /**
   * Optional for FAILED case
   */
  body('failureReason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Failure reason must not exceed 500 characters')
]

// Validation for payment ID parameter
export const paymentIdValidation = [
  param('paymentId')
    .trim()
    .notEmpty()
    .withMessage('Payment ID is required')
    .isUUID()
    .withMessage('Payment ID must be a valid UUID'),
];

// Validation for Razorpay webhook
export const razorpayWebhookValidation = [
  body('event')
    .trim()
    .notEmpty()
    .withMessage('Event is required'),
  
  body('payload')
    .notEmpty()
    .withMessage('Payload is required')
    .isObject()
    .withMessage('Payload must be an object'),
];

// Validation for verifying Juspay payment
export const verifyJuspayPaymentValidation = [
  body('orderId')
    .trim()
    .notEmpty()
    .withMessage('Order ID is required')
    .isUUID()
    .withMessage('Order ID must be a valid UUID'),

  body('juspayOrderId')
    .optional()
    .trim()
    .isString()
    .withMessage('juspayOrderId must be a string')
];

// Validation for Juspay webhook
export const juspayWebhookValidation = [
  body()
    .custom((value) => {
      if (!value || typeof value !== 'object') {
        throw new Error('Webhook payload must be an object')
      }
      return true
    })
];

// Validation for adding saved payment method
export const addSavedPaymentMethodValidation = [
  body('methodType')
    .trim()
    .notEmpty()
    .withMessage('Method type is required')
    .isIn(['CARD', 'UPI'])
    .withMessage('Method type must be either CARD or UPI'),

  body('provider')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Provider must not exceed 100 characters'),

  body('maskedNumber')
    .if(body('methodType').equals('CARD'))
    .trim()
    .notEmpty()
    .withMessage('Masked number is required for card payments')
    .matches(/^(\*+\s*){3}\d{4}$|^\d{4}$|^\*+\d{4}$/)
    .withMessage('Invalid masked card number format (e.g., **** **** **** 1234 or 1234)'),

  body('expiryMonth')
    .if(body('methodType').equals('CARD'))
    .trim()
    .notEmpty()
    .withMessage('Expiry month is required for card payments')
    .matches(/^(0[1-9]|1[0-2])$/)
    .withMessage('Expiry month must be between 01 and 12'),

  body('expiryYear')
    .if(body('methodType').equals('CARD'))
    .trim()
    .notEmpty()
    .withMessage('Expiry year is required for card payments')
    .matches(/^20\d{2}$|^\d{2}$/)
    .withMessage('Expiry year must be a 2 or 4 digit year'),

  body('cardholderName')
    .optional()
    .trim()
    .isLength({ max: 150 })
    .withMessage('Cardholder name must not exceed 150 characters'),

  body('upiId')
    .if(body('methodType').equals('UPI'))
    .trim()
    .notEmpty()
    .withMessage('UPI ID is required for UPI payments')
    .matches(/^[\w.-]+@[\w.-]+$/)
    .withMessage('Invalid UPI ID format (e.g., username@bank)'),

  body('gatewayToken')
    .optional()
    .trim(),

  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be a boolean')
];

// Validation for saved payment method ID param
export const savedPaymentMethodIdValidation = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Saved payment method ID is required')
    .isUUID()
    .withMessage('Saved payment method ID must be a valid UUID')
];

