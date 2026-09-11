import { body } from "express-validator";

export const createDeliveryQuestionValidation = [
  body("question")
    .trim()
    .notEmpty().withMessage("Question is required")
    .isLength({ min: 3 }).withMessage("Question must be at least 3 characters"),
];

export const updateDeliveryQuestionValidation = [
  body("question")
    .optional()
    .isLength({ min: 3 }).withMessage("Question must be at least 3 characters"),

  body("isActive")
    .optional()
    .isBoolean().withMessage("isActive must be a boolean")
];
