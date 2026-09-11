import express from 'express';
import { validationResult } from 'express-validator';
import { validationErrorResponse } from '../utils/responseHelper.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
  getContentByType,
  getAllActiveContent,
  upsertContent,
  updateContentById,
  deleteContentById
} from '../controllers/contentManagementController.js';
import {
  contentTypeParamValidation,
  upsertContentValidation,
  contentIdParamValidation
} from '../validations/contentManagementValidation.js';

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors);
  }
  next();
};

/**
 * GET /api/v1/content/all
 * GET /api/v1/content
 * Public: Fetch all active content & policy settings object for consumer app
 */
router.get('/all', getAllActiveContent);
router.get('/', getAllActiveContent);

/**
 * GET /api/v1/content/:type
 * Public: Fetch specific active content policy by type (TERMS_AND_CONDITIONS, PRIVACY_POLICY, CANCELLATIONS_AND_REFUNDS, ABOUT_US, FAQ)
 */
router.get('/:type', contentTypeParamValidation, validate, getContentByType);

/**
 * POST /api/v1/content
 * Admin: Create or update content document by type (upsert)
 */
router.post('/', authMiddleware, upsertContentValidation, validate, upsertContent);

/**
 * PUT /api/v1/content/:id
 * Admin: Update content document by ID
 */
router.put('/:id', authMiddleware, contentIdParamValidation, validate, updateContentById);

/**
 * DELETE /api/v1/content/:id
 * Admin: Soft delete content document by ID
 */
router.delete('/:id', authMiddleware, contentIdParamValidation, validate, deleteContentById);

export default router;
