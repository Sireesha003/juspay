import express from 'express'
import { getLoyaltyBalance } from '../controllers/loyaltyController.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const router = express.Router()

/**
 * @route   GET /api/v1/loyalty/balance
 * @desc    Get user's loyalty points balance
 * @access  Private
 */
router.get('/balance', authMiddleware, getLoyaltyBalance)

export default router
