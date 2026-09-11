import { body } from "express-validator";

export const createOrderRatingValidation = [
  body("userId")
    .notEmpty().withMessage("userId is required")
    .isUUID().withMessage("Invalid userId"),

  body("orderId")
    .notEmpty().withMessage("orderId is required")
    .isUUID().withMessage("Invalid orderId"),

  body("deliveryBoyId")
    .optional()
    .isUUID().withMessage("Invalid deliveryBoyId"),

  body("orderRating")
    .optional()
    .isInt({ min: 1, max: 5 }).withMessage("Order rating must be between 1–5"),

  body("deliveryRating")
    .optional()
    .isInt({ min: 1, max: 5 }).withMessage("Delivery rating must be between 1–5"),

  body("orderReview")
    .optional()
    .isString().withMessage("orderReview must be a string"),

  body("deliveryReview")
    .optional()
    .isString().withMessage("deliveryReview must be a string"),

  // NEW → Validate array of delivery questions
  body("deliveryQuestions")
    .optional()
    .isArray().withMessage("deliveryQuestions must be an array"),

  body("deliveryQuestions.*.questionId")
    .notEmpty().withMessage("questionId is required")
    .isUUID().withMessage("Invalid questionId"),

  body("deliveryQuestions.*.answer")
    .notEmpty().withMessage("answer is required")
    .isString().withMessage("answer must be a string")
];
