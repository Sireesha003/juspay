import { prisma } from '../config/prismaClient.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'

/**
 * Helper to get or create customer record
 */
async function getOrCreateCustomer(phone, name) {
  const tenantId = 'VK001'
  let customer = await prisma.customer.findUnique({
    where: {
      tenantId_mobile: {
        tenantId,
        mobile: phone
      }
    }
  })

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        mobile: phone,
        name: name || 'Consumer User',
        tenantId,
        creditBalance: 0.0
      }
    })
  }

  return customer
}

/**
 * Get user's wallet balance (maps to Customer.creditBalance)
 * GET /api/v1/wallet/balance
 */
export const getWalletBalance = asyncHandler(async (req, res) => {
  const phone = req.user.phone
  const name = req.user.name

  try {
    const customer = await getOrCreateCustomer(phone, name)
    return successResponse(res, 200, { balance: customer.creditBalance }, 'Wallet balance retrieved successfully')
  } catch (error) {
    logger.error('Error fetching wallet balance', { phone, error: error.message })
    return errorResponse(res, 500, 'Failed to fetch wallet balance')
  }
})

/**
 * Get wallet transactions history (maps to ActivityLog)
 * GET /api/v1/wallet/transactions
 */
export const getWalletTransactions = asyncHandler(async (req, res) => {
  const userId = req.user.id

  try {
    const logs = await prisma.activityLog.findMany({
      where: {
        userId,
        action: {
          in: ['WALLET_DEBIT', 'WALLET_CREDIT']
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const transactions = logs.map(log => {
      let amount = 0
      let type = 'CREDIT'
      try {
        const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata
        amount = meta?.amount || 0
        type = meta?.type || (log.action === 'WALLET_DEBIT' ? 'DEBIT' : 'CREDIT')
      } catch (e) {
        amount = 0
      }

      return {
        id: log.id,
        amount,
        type,
        description: log.details || 'Wallet Transaction',
        createdAt: log.createdAt
      }
    })

    return successResponse(res, 200, transactions, 'Wallet transactions retrieved successfully')
  } catch (error) {
    logger.error('Error fetching wallet transactions', { userId, error: error.message })
    return errorResponse(res, 500, 'Failed to fetch wallet transactions')
  }
})

/**
 * Add funds to user's wallet
 * POST /api/v1/wallet/add-funds
 */
export const addWalletFunds = asyncHandler(async (req, res) => {
  const phone = req.user.phone
  const userId = req.user.id
  const { amount } = req.body

  if (!amount || amount <= 0) {
    return errorResponse(res, 400, 'Amount must be greater than zero')
  }

  try {
    const customer = await getOrCreateCustomer(phone, req.user.name)

    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { creditBalance: { increment: parseFloat(amount) } }
      }),
      prisma.activityLog.create({
        data: {
          userId,
          action: 'WALLET_CREDIT',
          details: 'Added funds to wallet',
          metadata: { amount: parseFloat(amount), type: 'CREDIT' }
        }
      })
    ])

    logger.info('Funds added to wallet successfully', { phone, amount })

    return successResponse(res, 200, { balance: customer.creditBalance + parseFloat(amount) }, 'Funds added to wallet successfully')
  } catch (error) {
    logger.error('Error adding funds to wallet', { phone, error: error.message })
    return errorResponse(res, 500, 'Failed to add wallet balance')
  }
})
