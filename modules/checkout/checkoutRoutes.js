// modules/checkout/checkoutRoutes.js
import express from 'express'
import { processCheckout } from './checkoutController.js'
import { authMiddleware } from '../../middlewares/authMiddleware.js'

const router = express.Router()

// Checkout requires authentication
router.post('/', authMiddleware, processCheckout)

export default router
