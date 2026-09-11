// controllers/appContentLinkController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'


// ➤ Create
export const createAppContentLink = asyncHandler(async (req, res) => {
  logger.info("[AppContentLink] Creating link", { body: req.body })

  try {
    const newLink = await prisma.appContentLink.create({
      data: req.body
    })

    logger.info("[AppContentLink] Created", { id: newLink.id })

    return successResponse(
      res,
      201,
      { link: newLink },
      "App content link created successfully"
    )
  } catch (error) {
    logger.error("[AppContentLink] Create failed", { error: error.message })
    return errorResponse(res, 500, "Failed to create app content link")
  }
})


// ➤ Get all active
export const getAllAppContentLinks = asyncHandler(async (req, res) => {
  logger.info("[AppContentLink] Fetching all active links")

  try {
    const list = await prisma.appContentLink.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" }
    })

    logger.info("[AppContentLink] Fetched", { count: list.length })

    return successResponse(
      res,
      200,
      { links: list },
      "App content links fetched successfully"
    )
  } catch (error) {
    logger.error("[AppContentLink] Fetch failed", { error: error.message })
    return errorResponse(res, 500, "Failed to fetch app content links")
  }
})


// ➤ Get by ID
export const getAppContentLinkById = asyncHandler(async (req, res) => {
  const id = req.params.id
  logger.info("[AppContentLink] Fetching link by ID", { id })

  try {
    const link = await prisma.appContentLink.findFirst({
      where: { id, isActive: true }
    })

    if (!link) {
      logger.warn("[AppContentLink] Not found", { id })
      return errorResponse(res, 404, "App content link not found")
    }

    logger.info("[AppContentLink] Found", { id })

    return successResponse(
      res,
      200,
      { link },
      "App content link fetched successfully"
    )
  } catch (error) {
    logger.error("[AppContentLink] Fetch by ID failed", { error: error.message })
    return errorResponse(res, 500, "Failed to fetch app content link")
  }
})


// ➤ Update
export const updateAppContentLink = asyncHandler(async (req, res) => {
  const id = req.params.id
  logger.info("[AppContentLink] Updating link", { id, body: req.body })

  try {
    const updated = await prisma.appContentLink.update({
      where: { id },
      data: req.body
    })

    logger.info("[AppContentLink] Updated", { id })

    return successResponse(
      res,
      200,
      { link: updated },
      "App content link updated successfully"
    )
  } catch (error) {
    logger.error("[AppContentLink] Update failed", { error: error.message })
    return errorResponse(res, 500, "Failed to update app content link")
  }
})


// ➤ Soft Delete
export const deleteAppContentLink = asyncHandler(async (req, res) => {
  const id = req.params.id
  logger.info("[AppContentLink] Soft deleting link", { id })

  try {
    await prisma.appContentLink.update({
      where: { id },
      data: { isActive: false }
    })

    logger.info("[AppContentLink] Soft deleted", { id })

    return successResponse(
      res,
      200,
      {},
      "App content link deleted successfully"
    )
  } catch (error) {
    logger.error("[AppContentLink] Delete failed", { error: error.message })
    return errorResponse(res, 500, "Failed to delete app content link")
  }
})
