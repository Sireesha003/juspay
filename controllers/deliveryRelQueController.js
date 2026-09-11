import { prisma } from "../config/prismaClient.js";
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from "../utils/logger.js";
import { successResponse, errorResponse } from '../utils/responseHelper.js'

/**
 * CREATE DELIVERY QUESTION
 */
export const createDeliveryQuestion = asyncHandler(async (req, res) => {
    const { question } = req.body;

    logger.info("[DeliveryQuestion] Creating new question", { question });

    const exists = await prisma.deliveryRelatedQuestion.findFirst({
        where: { question },
    });

    if (exists) {
        logger.warn("[DeliveryQuestion] Duplicate question", { question });
        return errorResponse(res, 400, "This question already exists");
    }

    const saved = await prisma.deliveryRelatedQuestion.create({
        data: { question },
    });

    logger.info("[DeliveryQuestion] Created successfully", { id: saved.id });

    return successResponse(res, 201, saved, "Question created successfully");
});

/**
 * GET ALL QUESTIONS
 */
export const getAllDeliveryQuestions = asyncHandler(async (req, res) => {
    logger.info("[DeliveryQuestion] Fetching all questions");

    const list = await prisma.deliveryRelatedQuestion.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
    });

    logger.info("[DeliveryQuestion] Total questions fetched", {
        count: list.length,
    });

    return successResponse(res, 200, list, "Questions fetched successfully");
});

/**
 * GET BY ID
 */
export const getDeliveryQuestionById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    logger.info("[DeliveryQuestion] Fetching question", { id });

    const question = await prisma.deliveryRelatedQuestion.findUnique({
        where: { id },
    });

    if (!question) {
        logger.warn("[DeliveryQuestion] Not found", { id });
        return errorResponse(res, 404, "Question not found");
    }

    return successResponse(res, 200, question, "Question fetched successfully");
});

/**
 * UPDATE
 */
export const updateDeliveryQuestion = asyncHandler(async (req, res) => {
    const { id } = req.params;

    logger.info("[DeliveryQuestion] Updating question", {
        id,
        body: req.body,
    });

    try {
        const updated = await prisma.deliveryRelatedQuestion.update({
            where: { id },
            data: req.body,
        });

        logger.info("[DeliveryQuestion] Updated successfully", { id });

        return successResponse(res, 200, updated, "Question updated successfully");
    } catch (error) {
        logger.error("[DeliveryQuestion] Update failed", {
            id,
            error: error.message,
        });
        return errorResponse(res, 400, "Failed to update question");
    }
});

/**
 * SOFT DELETE
 */
export const deleteDeliveryQuestion = asyncHandler(async (req, res) => {
    const { id } = req.params;

    logger.info("[DeliveryQuestion] Soft delete request", { id });

    const existing = await prisma.deliveryRelatedQuestion.findUnique({
        where: { id },
    });

    if (!existing) {
        logger.warn("[DeliveryQuestion] Question not found for delete", { id });
        return errorResponse(res, 404, "Question not found");
    }

    const removed = await prisma.deliveryRelatedQuestion.update({
        where: { id },
        data: { isActive: false },
    });

    logger.info("[DeliveryQuestion] Soft deleted", { id });

    return successResponse(res, 200, removed, "Question deleted successfully");
});
