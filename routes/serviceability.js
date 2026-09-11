/**
 * Serviceability API - Pincode-Based Serviceability Check
 * 
 * This router checks if a given pincode is serviceable by any active warehouse.
 * It supports both pincode-based matching and distance-based selection using coordinates.
 * 
 * INTEGRATION:
 * 1. Mount this router in your main app:
 *    import serviceabilityRouter from './routes/serviceability.js';
 *    app.use('/api/v1/serviceability', serviceabilityRouter);
 */

import express from 'express';
import { validationResult } from 'express-validator';
import { validationErrorResponse } from '../utils/responseHelper.js';
import { serviceabilityValidation } from '../validations/serviceabilityValidation.js';
import { checkServiceability, notifyServiceability } from '../controllers/serviceabilityController.js';
import { getNearestStore } from '../controllers/storeLocatorController.js';

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
 * GET /api/v1/serviceability/nearest-store?latitude=12.97&longitude=77.59
 * POST /api/v1/serviceability/nearest-store
 * Dedicated endpoint to get the nearest store and distance from coordinates
 */
router.get('/nearest-store', getNearestStore);
router.post('/nearest-store', getNearestStore);

/**
 * POST /api/v1/serviceability
 * Check if a pincode is serviceable by any warehouse
 */
router.post('/', serviceabilityValidation, validate, checkServiceability);

/**
 * GET /api/v1/serviceability?pincode=560001&latitude=12.97&longitude=77.59
 * Alternative endpoint using query parameters (for convenience)
 */
router.get('/', serviceabilityValidation, validate, checkServiceability);

/**
 * POST /api/v1/serviceability/notify
 * Request to be notified when service is available in an area
 */
router.post('/notify', notifyServiceability);

export default router;

