import { body, param, query } from "express-validator";

export const createBannerValidator = [
  body("title").notEmpty().withMessage("title is required"),
  body("imageUrl").isURL().withMessage("Valid imageUrl required"),
  body("section").notEmpty().withMessage("section is required"),
  body("priority").optional().isInt({ min: 1 }),
  body("redirectUrl").optional().isURL(),
  body("isActive").optional().isBoolean(),
  body("status").optional().isIn(["ACTIVE", "INACTIVE"]),
];

export const bannerIdParamValidator = [
  param("id").isUUID().withMessage("Invalid banner id"),
];

export const getBannerQueryValidator = [
  query("section").optional().isString(),
  query("isActive").optional().isBoolean(),
];
