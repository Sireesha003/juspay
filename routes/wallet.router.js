import express from 'express'
import {
  getWalletBalance,
  getWalletTransactions,
  addWalletFunds
} from '../controllers/walletController.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const router = express.Router()

/**
 * @route   GET /api/v1/wallet/balance
 * @desc    Get user's wallet balance
 * @access  Private
 */
router.get('/balance', authMiddleware, getWalletBalance)

/**
 * @route   GET /api/v1/wallet/transactions
 * @desc    Get user's wallet transactions
 * @access  Private
 */
router.get('/transactions', authMiddleware, getWalletTransactions)

/**
 * @route   POST /api/v1/wallet/add-funds
 * @desc    Add funds to wallet
 * @access  Private
 */
router.post('/add-funds', authMiddleware, addWalletFunds)

export default router
