// validations/authValidation.js
import { body } from 'express-validator';

// Send OTP validation
export const sendOtpValidation = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Invalid phone number format')
    .isLength({ min: 10, max: 15 })
    .withMessage('Phone number must be between 10 and 15 digits'),
  
  body('countryCode')
    .optional()
    .trim()
    .matches(/^\+\d{1,4}$/)
    .withMessage('Invalid country code format (e.g., +91)')
];

// Resend OTP validation (same as send OTP)
export const resendOtpValidation = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Invalid phone number format')
    .isLength({ min: 10, max: 15 })
    .withMessage('Phone number must be between 10 and 15 digits'),
  
  body('countryCode')
    .optional()
    .trim()
    .matches(/^\+\d{1,4}$/)
    .withMessage('Invalid country code format (e.g., +91)')
];

// Verify OTP validation
export const verifyOtpValidation = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Invalid phone number format'),
  
  body('countryCode')
    .optional()
    .trim()
    .matches(/^\+\d{1,4}$/)
    .withMessage('Invalid country code format'),
  
  body('otp')
    .trim()
    .notEmpty()
    .withMessage('OTP is required')
    .isLength({ min: 4, max: 6 })
    .withMessage('OTP must be between 4 and 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers'),
  
  body('deviceId')
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty()
    .withMessage('Device ID cannot be empty if provided'),
  
  body('fcmToken')
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty()
    .withMessage('FCM token cannot be empty if provided'),
  
  body('referralCode')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[A-Z]{2}\d{5}$/)
    .withMessage('Referral code must be in format: 2 uppercase letters followed by 5 digits (e.g., AB12345)')
];

// Update Profile validation
export const updateProfileValidation = [
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  
 body('email')
  .optional({ checkFalsy: true })
  .trim()
  .isEmail()
  .withMessage('Invalid email format')
  .normalizeEmail(),
  
  body('gender')
    .optional()
    .trim()
    .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
    .withMessage('Gender must be one of: male, female, other, prefer_not_to_say'),
  
  body('dob')
    .optional()
    .isISO8601()
    .withMessage('Date of birth must be a valid date (ISO 8601 format)')
    .custom((value) => {
      const dob = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear();
      if (age < 13 || age > 120) {
        throw new Error('Date of birth must represent an age between 13 and 120 years');
      }
      return true;
    }),
  
  body('profileImage')
    .optional({ checkFalsy: true })
    .custom((value) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('data:image/')) {
          throw new Error('Profile image must be a valid URL or image string');
        }
      }
      return true;
    }),

  body('avatar')
    .optional({ checkFalsy: true })
    .custom((value) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('data:image/')) {
          throw new Error('Avatar must be a valid URL or image string');
        }
      }
      return true;
    }),
  
  body('address.label')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Address label must be less than 50 characters'),
  
  body('address.line1')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Address line 1 cannot be empty')
    .isLength({ max: 200 })
    .withMessage('Address line 1 must be less than 200 characters'),
  
  body('address.line2')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address line 2 must be less than 200 characters'),
  
  body('address.city')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('City cannot be empty')
    .isLength({ max: 100 })
    .withMessage('City must be less than 100 characters'),
  
  body('address.state')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('State cannot be empty')
    .isLength({ max: 100 })
    .withMessage('State must be less than 100 characters'),
  
  body('address.pincode')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Pincode cannot be empty')
    .matches(/^\d{5,6}$/)
    .withMessage('Pincode must be 5 or 6 digits'),
  
  body('address.location.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('address.location.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  body('referralCode')
    .optional()
    .trim()
    .matches(/^[A-Z]{2}\d{5}$/)
    .withMessage('Referral code must be in format: 2 uppercase letters followed by 5 digits (e.g., AB12345)'),

  body('dietaryPreference')
    .optional()
    .trim()
    .isIn(['VEG', 'NON-VEG', 'EGGITARIAN', 'VEGAN', 'HALAL'])
    .withMessage('Dietary preference must be one of: VEG, NON-VEG, EGGITARIAN, VEGAN, HALAL'),
  
  body('deliveryPreference')
    .optional()
    .trim()
    .isIn(['LEAVE_AT_DOOR', 'HAND_TO_ME', 'CALL_BEFORE_DELIVERY', 'RING_BELL'])
    .withMessage('Delivery preference must be one of: LEAVE_AT_DOOR, HAND_TO_ME, CALL_BEFORE_DELIVERY, RING_BELL')
];

// Update Token validation
export const updateTokenValidation = [
  body('userId')
    .trim()
    .notEmpty()
    .withMessage('userId is required'),

  body('deviceId')
    .trim()
    .notEmpty()
    .withMessage('deviceId is required'),

  body('deviceToken')
    .trim()
    .notEmpty()
    .withMessage('deviceToken is required'),

  body('platform')
    .optional()
    .trim()
    .isIn(['android', 'ios', 'web'])
    .withMessage('platform must be one of: android, ios, web'),

  body('notificationEnabled')
    .optional()
    .isBoolean()
    .withMessage('notificationEnabled must be a boolean'),

  body('isEmulator')
    .optional()
    .isBoolean()
    .withMessage('isEmulator must be a boolean'),

  body('isRooted')
    .optional()
    .isBoolean()
    .withMessage('isRooted must be a boolean'),

  body('updatedAt')
    .optional()
    .isISO8601()
    .withMessage('updatedAt must be a valid ISO8601 datetime')
];

