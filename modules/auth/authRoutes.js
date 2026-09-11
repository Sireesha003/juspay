// modules/auth/authRoutes.js
import express from 'express';
import {
  sendOtp,
  resendOtp,
  verifyOtp,
  getProfile,
  updateProfile,
  socialLogin,
  deleteAccount,
  refreshToken
} from './authController.js';
import {
  sendOtpValidation,
  resendOtpValidation,
  verifyOtpValidation,
  updateProfileValidation
} from '../../validations/authValidation.js';
import { validationResult } from 'express-validator';
import { validationErrorResponse } from '../../utils/responseHelper.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors);
  }
  next();
};

router.post('/login', sendOtpValidation, validate, sendOtp);
router.post('/register', sendOtpValidation, validate, sendOtp); // OTP-based flow handles registration implicitly
router.post('/send-otp', sendOtpValidation, validate, sendOtp);
router.post('/resend-otp', resendOtpValidation, validate, resendOtp);
router.post('/verify-otp', verifyOtpValidation, validate, verifyOtp);
router.post('/social-login', socialLogin);
router.post('/refresh-token', refreshToken);
router.post('/refresh', refreshToken);

router.get('/me', authMiddleware, getProfile);
router.patch('/update-profile', authMiddleware, updateProfileValidation, validate, updateProfile);
router.delete('/account', authMiddleware, deleteAccount);

export default router;
