// routes/authRoutes.js
import express from 'express';
import {
  sendOtp,
  resendOtp,
  verifyOtp,
  getProfile,
  updateProfile,
  deleteAccount,
} from '../controllers/authController.js';
import {
  sendOtpValidation,
  resendOtpValidation,
  verifyOtpValidation,
  updateProfileValidation,
} from '../validations/authValidation.js';
import { validationResult } from 'express-validator';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validationErrorResponse } from '../utils/responseHelper.js';

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors);
  }
  next();
};

/**
 * @route   POST /api/v1/user/send-otp
 * @desc    Send OTP to phone number for login/registration
 * @access  Public
 */
router.post('/send-otp', sendOtpValidation, validate, sendOtp);

/**
 * @route   POST /api/v1/user/resend-otp
 * @desc    Resend OTP to phone number (separate rate limiting)
 * @access  Public
 */
router.post('/resend-otp', resendOtpValidation, validate, resendOtp);

/**
 * @route   POST /api/v1/user/verify-otp
 * @desc    Verify OTP and login/register user
 * @access  Public
 */
router.post('/verify-otp', verifyOtpValidation, validate, verifyOtp);

/**
 * @route   GET /api/v1/user/me
 * @desc    Get current user profile
 * @access  Private (requires authentication)
 */
router.get('/me', authMiddleware, getProfile);

/**
 * @route   PATCH /api/v1/user/update-profile
 * @desc    Update user profile
 * @access  Private (requires authentication)
 */
router.patch('/update-profile', authMiddleware, updateProfileValidation, validate, updateProfile);

/**
 * @route   DELETE /api/v1/user/account
 * @desc    Delete user account
 * @access  Private (requires authentication)
 */
router.delete('/account', authMiddleware, deleteAccount);

export default router;
