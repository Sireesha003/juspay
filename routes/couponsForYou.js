/**
 * Coupons for You API - Personalized Coupon Fetching
 * 
 * This router fetches personalized and global coupons for customers, including
 * eligibility checks, discount calculations, and usage tracking.
 * 
 * INTEGRATION:
 * 1. Mount this router in your main app:
 *    import couponsRouter from './routes/couponsForYou.js';
 *    app.use('/api/v1/coupons', couponsRouter);
 */

import express from 'express';
import { validationResult } from 'express-validator';
import { validationErrorResponse } from '../utils/responseHelper.js';
import { couponsQueryValidation, couponsCartQueryValidation } from '../validations/couponsValidation.js';
import { getCouponsForHome, getCouponsForCart } from '../controllers/couponsController.js';

const router = express.Router();

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors);
  }
  next();
};

/**
 * GET /api/v1/coupons
 * Get Coupons for Home Page
 * Returns all applicable coupons (global and warehouse-specific) that are active, not expired
 * Does NOT filter by cart value - shows all eligible coupons
 */
router.get('/', couponsQueryValidation, validate, getCouponsForHome);

/**
 * GET /api/v1/coupons/cart
 * Get Coupons for Cart Page
 * Returns coupons (global and warehouse-specific) that are active, valid, and applicable
 * based on the user's current cart value, along with other eligibility conditions
 */
router.get('/cart', couponsCartQueryValidation, validate, getCouponsForCart);

export default router;

