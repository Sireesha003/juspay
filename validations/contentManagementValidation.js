import { body, param } from 'express-validator'

const ALLOWED_CONTENT_TYPES = [
  'ABOUT_US',
  'TERMS_AND_CONDITIONS',
  'PRIVACY_POLICY',
  'CANCELLATIONS_AND_REFUNDS',
  'FAQ',
  'ABOUT',
  'TERMS',
  'PRIVACY',
  'CANCELLATION',
  'REFUND',
  'REFUNDS'
]

export const contentTypeParamValidation = [
  param('type')
    .notEmpty()
    .withMessage('Content type parameter is required')
    .bail()
    .custom((value) => {
      const upper = String(value).toUpperCase()
      if (!ALLOWED_CONTENT_TYPES.includes(upper)) {
        throw new Error(
          `Invalid content type. Allowed types: ${ALLOWED_CONTENT_TYPES.join(', ')}`
        )
      }
      return true
    })
]

export const upsertContentValidation = [
  body('type')
    .notEmpty()
    .withMessage('Content type is required')
    .bail()
    .custom((value) => {
      const upper = String(value).toUpperCase()
      if (!ALLOWED_CONTENT_TYPES.includes(upper)) {
        throw new Error(
          `Invalid content type. Allowed types: ${ALLOWED_CONTENT_TYPES.join(', ')}`
        )
      }
      return true
    }),

  body('title')
    .optional()
    .isString()
    .withMessage('Title must be a string'),

  body('content')
    .notEmpty()
    .withMessage('Content text/HTML is required')
    .isString()
    .withMessage('Content must be a string')
]

export const contentIdParamValidation = [
  param('id')
    .notEmpty()
    .withMessage('Content ID is required')
    .isUUID()
    .withMessage('Invalid Content ID format')
]
