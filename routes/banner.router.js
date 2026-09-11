import express from "express";
import {
  createBanner,
  getAllBanners,
  getBannerById,
  softDeleteBanner,
  restoreBanner,
  updateBanner
} from "../controllers/bannerConntroller.js";

import {
  createBannerValidator,
  bannerIdParamValidator,
  getBannerQueryValidator
} from "../validations/bannerValidation.js";

import { validationResult } from 'express-validator';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validationErrorResponse } from '../utils/responseHelper.js';

const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors)
  }
  next()
}

const router = express.Router();

/**
 * CREATE BANNER
 */
router.post(
  "/",
  authMiddleware,
  createBannerValidator,
  validate,
  createBanner
);

/**
 * GET ALL BANNERS
 */
router.get(
  "/",
  authMiddleware,
  getBannerQueryValidator,
  validate,
  getAllBanners
);

/**
 * GET BANNER BY ID
 */
router.get(
  "/:id",
  authMiddleware,
  bannerIdParamValidator,
  validate,
  getBannerById
);

router.delete(
  "/delete/:id",
  authMiddleware,
  softDeleteBanner
)

router.put(
  "/update/:id",
  authMiddleware,
  updateBanner
)

router.patch(
  "/restore/:id",
  authMiddleware,
  restoreBanner
)

export default router;
