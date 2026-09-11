// modules/users/userRoutes.js
import express from 'express';
import { getProfile, updateProfile } from './userController.js';
import { getUserRefunds, getRefundById } from '../../controllers/returnsController.js';
import { updateProfileValidation } from '../../validations/authValidation.js';
import { validationResult } from 'express-validator';
import { authMiddleware } from '../../middlewares/authMiddleware.js';
import { validationErrorResponse } from '../../utils/responseHelper.js';

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors);
  }
  next();
};

router.get('/profile', authMiddleware, getProfile);
router.get('/me', authMiddleware, getProfile);
router.patch('/profile', authMiddleware, updateProfileValidation, validate, updateProfile);
router.get('/refunds', authMiddleware, getUserRefunds);
router.get('/refunds/:refundId', authMiddleware, getRefundById);
router.get('/user/refunds', authMiddleware, getUserRefunds);

export default router;
