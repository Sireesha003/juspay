import express from "express";
import { validationResult } from "express-validator";
import {
  createSuggestionValidation,
  updateSuggestionValidation,
  idValidation
} from "../validations/suggestionValidation.js";

import {
  createSuggestion,
  getAllSuggestions,
  getSuggestionById,
  updateSuggestion,
  deleteSuggestion
} from "../controllers/suggestionController.js";

const router = express.Router();

// Validation handler middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      message: "Validation Failed",
      errors: errors.array(),
    });
  }
  next();
};

// Create
router.post(
  "/",
  createSuggestionValidation,
  validate,
  createSuggestion
);

// Get all
router.get("/", getAllSuggestions);

// Get by ID
router.get(
  "/:id",
  idValidation,
  validate,
  getSuggestionById
);

// Update
router.put(
  "/:id",
  updateSuggestionValidation,
  validate,
  updateSuggestion
);

// Soft delete
router.delete(
  "/:id",
  idValidation,
  validate,
  deleteSuggestion
);

export default router;
