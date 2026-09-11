import { body, param } from "express-validator";

export const createSuggestionValidation = [
  body("suggestion")
    .notEmpty().withMessage("Suggestion is required")
    .isString().withMessage("Suggestion must be a string"),

  body("roleName")
    .notEmpty().withMessage("roleName is required")
    .isString().withMessage("roleName must be a string"),
];

export const updateSuggestionValidation = [
  param("id")
    .notEmpty().withMessage("ID is required")
    .isUUID().withMessage("Invalid ID format"),

  body("suggestion")
    .optional()
    .isString().withMessage("Suggestion must be a string"),

  body("roleName")
    .optional()
    .isString().withMessage("roleName must be a string")
];

export const idValidation = [
  param("id")
    .notEmpty().withMessage("ID is required")
    .isUUID().withMessage("Invalid ID format")
];
