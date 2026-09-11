// controllers/introController.js
import { prisma } from '../config/prismaClient.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'

/**
 * Get all active intro screens
 * GET /api/v1/app/intro-screens
 */
export const getIntroScreens = asyncHandler(async (req, res) => {
  try {
    const introScreens = await prisma.introScreen.findMany({
      where: {
        isActive: true
      },
      orderBy: [
        { displayOrder: 'asc' },
        { createdAt: 'asc' }
      ],
      select: {
        id: true,
        title: true,
        subtitle: true,
        imageUrl: true,
        videoUrl: true,
        displayOrder: true,
        isActive: true
      }
    })

    logger.info('Intro screens fetched', {
      count: introScreens.length
    })

    return successResponse(
      res,
      200,
      introScreens,
      'Intro screens retrieved successfully'
    )
  } catch (error) {
    logger.error('Error fetching intro screens', {
      error: error.message,
      stack: error.stack
    })

    return errorResponse(res, 500, 'Failed to fetch intro screens')
  }
})
