import express from "express";
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import {
  createAppContentLink,
  getAllAppContentLinks,
  getAppContentLinkById,
  updateAppContentLink,
  deleteAppContentLink
} from "../controllers/appContentLinkController.js";

import {
  createAppContentLinkValidator,
  updateAppContentLinkValidator
} from "../validations/appConLinkValidation.js";

const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors)
  }
  next()
}

const router = express.Router();

router.post("/", authMiddleware,createAppContentLinkValidator, validate, createAppContentLink);

router.get("/",authMiddleware, getAllAppContentLinks);

router.get("/:id", authMiddleware, getAppContentLinkById);

router.put("/:id", authMiddleware, updateAppContentLinkValidator, validate, updateAppContentLink);
router.delete("/:id", authMiddleware, deleteAppContentLink);

export default router;
