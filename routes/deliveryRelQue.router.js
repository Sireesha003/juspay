import express from "express";
import {
  createDeliveryQuestion,
  getAllDeliveryQuestions,
  getDeliveryQuestionById,
  updateDeliveryQuestion,
  deleteDeliveryQuestion
} from "../controllers/deliveryRelQueController.js";

import {
  createDeliveryQuestionValidation,
  updateDeliveryQuestionValidation
} from "../validations/deliveryRelQueValidation.js";

import { validateRequest } from "../middlewares/validationsResMiddleware.js";

const router = express.Router();

// CREATE
router.post(
  "/",
  createDeliveryQuestionValidation,
  validateRequest,
  createDeliveryQuestion
);

// GET ALL
router.get("/", getAllDeliveryQuestions);

// GET ONE
router.get("/:id", getDeliveryQuestionById);

// UPDATE
router.put(
  "/:id",
  updateDeliveryQuestionValidation,
  validateRequest,
  updateDeliveryQuestion
);

// DELETE
router.delete("/:id", deleteDeliveryQuestion);

export default router;
