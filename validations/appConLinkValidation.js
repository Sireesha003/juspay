import { body } from "express-validator";

export const createAppContentLinkValidator = [
  body("roleName").notEmpty().withMessage("roleName is required"),
  body("title").notEmpty().withMessage("title is required"),
  body("titleType").notEmpty().withMessage("titleType is required"),
  body("subTitle").notEmpty().withMessage("subTitle is required"),
  body("icon").notEmpty().withMessage("icon is required"),
  body("linkPath").notEmpty().withMessage("linkPath is required"),
];

export const updateAppContentLinkValidator = [
  body("roleName").optional().notEmpty(),
  body("title").optional().notEmpty(),
  body("titleType").optional().notEmpty(),
  body("subTitle").optional().notEmpty(),
  body("icon").optional().notEmpty(),
  body("linkPath").optional().notEmpty(),
];
