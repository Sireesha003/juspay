// validations/serviceabilityValidation.js
import { check } from 'express-validator';

/**
 * Validation for serviceability endpoint
 * Requires either a valid pincode OR valid GPS coordinates (latitude & longitude)
 */
export const serviceabilityValidation = [
  check('pincode')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\d{5,6}$/)
    .withMessage('Pincode must be 5 or 6 digits'),

  check('latitude')
    .optional({ checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),

  check('longitude')
    .optional({ checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),

  check('lat')
    .optional({ checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),

  check('lng')
    .optional({ checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),

  check('userId')
    .optional({ checkFalsy: true })
    .isUUID('4')
    .withMessage('userId must be a valid UUID'),

  (req, res, next) => {
    const body = req.body || {}
    const query = req.query || {}
    const pincode = body.pincode || query.pincode
    const rawLat = body.latitude ?? query.latitude ?? body.lat ?? query.lat
    const rawLng = body.longitude ?? query.longitude ?? body.lng ?? query.lng

    const hasPincode = pincode && String(pincode).trim().length > 0
    const hasCoords = rawLat !== undefined && rawLng !== undefined && String(rawLat).trim() !== '' && String(rawLng).trim() !== ''

    if (!hasPincode && !hasCoords) {
      return res.status(400).json({
        success: false,
        message: 'Either pincode or GPS coordinates (latitude & longitude) are required'
      })
    }
    next()
  }
];

