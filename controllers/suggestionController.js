import { prisma } from "../config/prismaClient.js";
import { asyncHandler } from "../middlewares/errorMiddleware.js";
import logger from "../utils/logger.js";
import { successResponse, errorResponse } from "../utils/responseHelper.js";

// Create
export const createSuggestion = asyncHandler(async (req, res) => {
  logger.info("[Suggestion] Creating suggestion", { body: req.body });

  const { suggestion, roleName } = req.body;

  const newSuggestion = await prisma.suggestion.create({
    data: { suggestion, roleName }
  });

  logger.info("[Suggestion] Created", newSuggestion);

  return successResponse(
    res,
    201,
    { suggestion: newSuggestion },
    "Suggestion created successfully"
  );
});

// Get all active
export const getAllSuggestions = asyncHandler(async (req, res) => {
  logger.info("[Suggestion] Fetching all active suggestions");

  const list = await prisma.suggestion.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" }
  });

  logger.info("[Suggestion] Count fetched", { count: list.length });

  return successResponse(
    res,
    200,
    { suggestions: list },
    "Suggestions fetched successfully"
  );
});

// Get by ID
export const getSuggestionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info("[Suggestion] Fetching suggestion", { id });

  const suggestion = await prisma.suggestion.findFirst({
    where: { id, isActive: true }
  });

  if (!suggestion) {
    logger.warn("[Suggestion] Not found", { id });
    return errorResponse(res, 404, "Suggestion not found");
  }

  logger.info("[Suggestion] Found", suggestion);

  return successResponse(
    res,
    200,
    { suggestion },
    "Suggestion fetched successfully"
  );
});

// Update
export const updateSuggestion = asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info("[Suggestion] Updating suggestion", { id, body: req.body });

  const updated = await prisma.suggestion.update({
    where: { id },
    data: req.body
  });

  logger.info("[Suggestion] Updated", updated);

  return successResponse(
    res,
    200,
    { suggestion: updated },
    "Suggestion updated successfully"
  );
});

// Soft delete
export const deleteSuggestion = asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info("[Suggestion] Soft deleting", { id });

  await prisma.suggestion.update({
    where: { id },
    data: { isActive: false }
  });

  logger.info("[Suggestion] Soft delete completed", { id });

  return successResponse(
    res,
    200,
    {},
    "Suggestion deleted successfully"
  );
});
