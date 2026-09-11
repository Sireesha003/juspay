import { prisma } from '../config/prismaClient.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'

/**
 * Get user's loyalty points balance (maps to Customer.loyaltyPoints)
 * GET /api/v1/loyalty/balance
 */
export const getLoyaltyBalance = asyncHandler(async (req, res) => {
  const userId = req.user.id

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true }
    })
    const phone = user ? user.phone : null

    if (!phone) {
      return errorResponse(res, 400, 'User phone number not found')
    }
    const customer = await prisma.customer.findUnique({
      where: {
        tenantId_mobile: {
          tenantId: 'VK001',
          mobile: phone
        }
      },
      select: { loyaltyPoints: true }
    })

    const balance = customer ? customer.loyaltyPoints : 0
    return successResponse(res, 200, { loyaltyPoints: balance }, 'Loyalty points balance fetched successfully')
  } catch (error) {
    logger.error('Error fetching loyalty points balance', { phone, error: error.message })
    return errorResponse(res, 500, 'Failed to fetch loyalty points balance')
  }
})
