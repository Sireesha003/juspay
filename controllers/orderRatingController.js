import { prisma } from "../config/prismaClient.js";
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from "../utils/logger.js";
import { successResponse, errorResponse } from '../utils/responseHelper.js'

/**
 * CREATE ORDER RATING
 */
export const createOrderRating = asyncHandler(async (req, res) => {
  const {
    userId,
    deliveryBoyId,
    orderId,
    orderRating,
    orderReview,
    deliveryRating,
    deliveryReview,
    deliveryQuestions
  } = req.body;

  logger.info("[OrderRating] Creating rating", { userId, orderId });

  const saved = await prisma.orderRating.create({
    data: {
      userId,
      deliveryBoyId,
      orderId,
      orderRating,
      orderReview,
      deliveryRating,
      deliveryReview,
      deliveryQuestions
    }
  });

  logger.info("[OrderRating] Created successfully", { id: saved.id });

  return successResponse(res, 201, saved, "Rating submitted successfully");
});

/**
 * GET RATINGS (for admin or analytics)
 */
export const getAllOrderRatings = asyncHandler(async (req, res) => {
  logger.info("[OrderRating] Fetching all ratings");

  const ratings = await prisma.orderRating.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" }
  });

  return successResponse(res, 200, ratings, "Ratings fetched successfully");
});

/**
 * GET RATING BY ORDER
 */
export const getRatingByOrderId = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  logger.info("[OrderRating] Fetching rating for order", { orderId });

  const rating = await prisma.orderRating.findFirst({
    where: { orderId, isActive: true }
  });

  if (!rating) {
    logger.warn("[OrderRating] No rating found", { orderId });
    return errorResponse(res, 404, "Rating not found for this order");
  }

  return successResponse(res, 200, rating, "Rating fetched successfully");
});

/**
 * UPDATE
 */
export const updateOrderRating = asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info("[OrderRating] Updating rating", { id, body: req.body });

  try {
    const updated = await prisma.orderRating.update({
      where: { id },
      data: req.body
    });

    return successResponse(res, 200, updated, "Rating updated successfully");
  } catch (err) {
    logger.error("[OrderRating] Update failed", { id, error: err.message });
    return errorResponse(res, 400, "Failed to update rating");
  }
});

/**
 * SOFT DELETE
 */
export const deleteOrderRating = asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info("[OrderRating] Soft deleting rating", { id });

  await prisma.orderRating.update({
    where: { id },
    data: { isActive: false }
  });

  return successResponse(res, 200, null, "Rating deleted successfully");
});
