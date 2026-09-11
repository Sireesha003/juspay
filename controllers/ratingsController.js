// controllers/ratingsController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

/**
 * Verify if user has purchased the product
 */
async function verifyPurchase(userId, productId) {
  const order = await prisma.order.findFirst({
    where: {
      consumerId: userId,
      status: 'DELIVERED',
      items: {
        some: {
          productId: productId
        }
      }
    },
    select: {
      id: true
    }
  })
  return !!order
}

/**
 * Format rating for response
 */
function formatRating(rating) {
  return {
    id: rating.id,
    rating: rating.rating,
    review: rating.review,
    product: rating.product ? {
      id: rating.product.id,
      name: rating.product.name,
      images: rating.product.images || []
    } : null,
    user: rating.user ? {
      id: rating.user.id,
      name: rating.user.name,
      avatar: rating.user.avatar
    } : null,
    createdAt: rating.createdAt,
    updatedAt: rating.updatedAt
  }
}

/**
 * POST /api/v1/products/:productId/ratings
 * Add or update product rating and review
 */
export const addOrUpdateRating = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { productId } = req.params
  const { rating, review } = req.body

  logger.info('[Ratings] Adding/updating rating', { userId, productId, rating })

  // Validate rating value
  if (rating < 1 || rating > 5) {
    return errorResponse(res, 400, 'Rating must be between 1 and 5')
  }

  // Check if product exists
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, isActive: true }
  })

  if (!product) {
    return errorResponse(res, 404, 'Product not found')
  }

  if (!product.isActive) {
    return errorResponse(res, 400, 'Cannot rate inactive product')
  }

  // Verify user has purchased the product
  const hasPurchased = await verifyPurchase(userId, productId)
  if (!hasPurchased) {
    return errorResponse(res, 403, 'You can only rate products you have purchased')
  }

  // Upsert rating (create or update)
  const ratingRecord = await prisma.rating.upsert({
    where: {
      userId_productId: {
        userId,
        productId
      }
    },
    update: {
      rating,
      review: review || null,
      updatedAt: new Date()
    },
    create: {
      userId,
      productId,
      rating,
      review: review || null
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          images: true
        }
      },
      user: {
        select: {
          id: true,
          name: true,
          avatar: true
        }
      }
    }
  })

  logger.info('[Ratings] Rating added/updated successfully', { userId, productId, ratingId: ratingRecord.id })

  return successResponse(res, 200, { rating: formatRating(ratingRecord) }, 'Rating added/updated successfully')
})

/**
 * GET /api/v1/products/:productId/ratings
 * Get all ratings and reviews for a product
 */
export const getProductRatings = asyncHandler(async (req, res) => {
  const { productId } = req.params
  const { page: pageParam, limit: limitParam } = req.query

  // Validate and constrain pagination parameters
  const pageNum = Math.max(1, parseInt(pageParam) || 1)
  const limitNum = Math.min(
    Math.max(1, parseInt(limitParam) || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  )

  logger.info('[Ratings] Fetching product ratings', { productId, page: pageNum, limit: limitNum })

  // Check if product exists
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true }
  })

  if (!product) {
    return errorResponse(res, 404, 'Product not found')
  }

  const skip = (pageNum - 1) * limitNum
  const take = limitNum

  // Get ratings with pagination
  const [ratings, total] = await Promise.all([
    prisma.rating.findMany({
      where: { productId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        }
      }
    }),
    prisma.rating.count({
      where: { productId }
    })
  ])

  // Calculate average rating
  const avgResult = await prisma.rating.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { rating: true }
  })

  const formattedRatings = ratings.map(rating => ({
    id: rating.id,
    rating: rating.rating,
    review: rating.review,
    user: {
      id: rating.user.id,
      name: rating.user.name,
      avatar: rating.user.avatar
    },
    createdAt: rating.createdAt,
    updatedAt: rating.updatedAt
  }))

  const totalPages = Math.ceil(total / take)

  return successResponse(res, 200, {
    ratings: formattedRatings,
    averageRating: avgResult._avg.rating || 0,
    totalRatings: avgResult._count.rating || 0,
    pagination: {
      page: pageNum,
      limit: take,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    }
  }, 'Product ratings fetched successfully')
})

/**
 * GET /api/v1/ratings/my-ratings
 * Get user's own ratings
 */
export const getUserRatings = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { page: pageParam, limit: limitParam } = req.query

  // Validate and constrain pagination parameters
  const pageNum = Math.max(1, parseInt(pageParam) || 1)
  const limitNum = Math.min(
    Math.max(1, parseInt(limitParam) || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  )

  logger.info('[Ratings] Fetching user ratings', { userId, page: pageNum, limit: limitNum })

  const skip = (pageNum - 1) * limitNum
  const take = limitNum

  const [ratings, total] = await Promise.all([
    prisma.rating.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            images: true,
            price: true
          }
        }
      }
    }),
    prisma.rating.count({
      where: { userId }
    })
  ])

  const formattedRatings = ratings.map(rating => ({
    id: rating.id,
    rating: rating.rating,
    review: rating.review,
    product: {
      id: rating.product.id,
      name: rating.product.name,
      images: rating.product.images || [],
      price: rating.product.price
    },
    createdAt: rating.createdAt,
    updatedAt: rating.updatedAt
  }))

  const totalPages = Math.ceil(total / take)

  return successResponse(res, 200, {
    ratings: formattedRatings,
    pagination: {
      page: pageNum,
      limit: take,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    }
  }, 'User ratings fetched successfully')
})

/**
 * PATCH /api/v1/ratings/:ratingId
 * Update existing rating/review
 */
export const updateRating = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { ratingId } = req.params
  const { rating, review } = req.body

  logger.info('[Ratings] Updating rating', { userId, ratingId })

  // Validate rating value if provided
  if (rating !== undefined && (rating < 1 || rating > 5)) {
    return errorResponse(res, 400, 'Rating must be between 1 and 5')
  }

  // Check if rating exists and belongs to user
  const existingRating = await prisma.rating.findUnique({
    where: { id: ratingId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          images: true
        }
      },
      user: {
        select: {
          id: true,
          name: true,
          avatar: true
        }
      }
    }
  })

  if (!existingRating) {
    return errorResponse(res, 404, 'Rating not found')
  }

  if (existingRating.userId !== userId) {
    return errorResponse(res, 403, 'You can only update your own ratings')
  }

  // Update rating
  const updateData = {}
  if (rating !== undefined) updateData.rating = rating
  if (review !== undefined) updateData.review = review || null
  updateData.updatedAt = new Date()

  const updatedRating = await prisma.rating.update({
    where: { id: ratingId },
    data: updateData,
    include: {
      product: {
        select: {
          id: true,
          name: true,
          images: true
        }
      },
      user: {
        select: {
          id: true,
          name: true,
          avatar: true
        }
      }
    }
  })

  logger.info('[Ratings] Rating updated successfully', { userId, ratingId })

  return successResponse(res, 200, { rating: formatRating(updatedRating) }, 'Rating updated successfully')
})

/**
 * DELETE /api/v1/ratings/:ratingId
 * Delete rating/review
 */
export const deleteRating = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { ratingId } = req.params

  logger.info('[Ratings] Deleting rating', { userId, ratingId })

  // Check if rating exists and belongs to user
  const existingRating = await prisma.rating.findUnique({
    where: { id: ratingId }
  })

  if (!existingRating) {
    return errorResponse(res, 404, 'Rating not found')
  }

  if (existingRating.userId !== userId) {
    return errorResponse(res, 403, 'You can only delete your own ratings')
  }

  // Delete rating
  await prisma.rating.delete({
    where: { id: ratingId }
  })

  logger.info('[Ratings] Rating deleted successfully', { userId, ratingId })

  return successResponse(res, 200, {}, 'Rating deleted successfully')
})

