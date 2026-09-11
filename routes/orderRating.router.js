import express from "express";
import {
  createOrderRating,
  getAllOrderRatings,
  getRatingByOrderId,
  updateOrderRating,
  deleteOrderRating
} from "../controllers/orderRatingController.js";

import {
  createOrderRatingValidation
} from "../validations/orderRatingValidation.js";
import { validateRequest } from "../middlewares/validationsResMiddleware.js";

const router = express.Router();

router.post(
  "/",
  createOrderRatingValidation,
  validateRequest,
  createOrderRating
);

router.get("/", getAllOrderRatings);

router.get("/order/:orderId", getRatingByOrderId);

router.put("/:id", updateOrderRating);

router.delete("/:id", deleteOrderRating);

export default router;
