import express from 'express'
import { prisma } from '../config/prismaClient.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const router = express.Router()

/**
 * @route   GET /api/v1/referral/details
 * @desc    Get user's referral code and referred friends statistics
 * @access  Private
 */
router.get('/details', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, inviteRefCode: true }
    })

    if (!user) {
      return errorResponse(res, 404, 'User not found')
    }

    if (!user.inviteRefCode) {
      return successResponse(res, 200, {
        inviteRefCode: null,
        referredCount: 0,
        referredUsers: []
      }, 'Referral details retrieved successfully. Set your name to generate a referral code.')
    }

    // Find users referred by this user
    const referredUsers = await prisma.user.findMany({
      where: { referralCode: user.inviteRefCode },
      select: {
        id: true,
        phone: true,
        name: true,
        createdAt: true
      }
    })

    // Obfuscate phone numbers for privacy
    const formattedReferredUsers = referredUsers.map(ref => ({
      id: ref.id,
      name: ref.name || 'Anonymous User',
      phone: ref.phone ? `${ref.phone.slice(0, 3)}*****${ref.phone.slice(-3)}` : 'N/A',
      createdAt: ref.createdAt
    }))

    return successResponse(res, 200, {
      inviteRefCode: user.inviteRefCode,
      referredCount: formattedReferredUsers.length,
      referredUsers: formattedReferredUsers
    }, 'Referral details retrieved successfully')
  } catch (error) {
    return errorResponse(res, 500, 'Failed to fetch referral details')
  }
}))

export default router
