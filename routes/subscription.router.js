import express from 'express'
import {
  createSubscription,
  getSubscriptions,
  updateSubscriptionStatus
} from '../controllers/subscriptionController.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const router = express.Router()

router.use(authMiddleware)

/**
 * @route   POST /api/v1/subscriptions
 * @desc    Create a new product subscription
 * @access  Private
 */
router.post('/', createSubscription)

/**
 * @route   GET /api/v1/subscriptions
 * @desc    Get user's product subscriptions
 * @access  Private
 */
router.get('/', getSubscriptions)

/**
 * @route   PATCH /api/v1/subscriptions/:id
 * @desc    Update subscription status (ACTIVE, PAUSED, CANCELLED)
 * @access  Private
 */
router.patch('/:id', updateSubscriptionStatus)

export default router
