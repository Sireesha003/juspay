import express from "express";
import { getActiveBundles, getBundleById } from "../controllers/bundleController.js";

const router = express.Router();

router.route("/")
  .get(getActiveBundles);

router.route("/:id")
  .get(getBundleById);

export default router;
