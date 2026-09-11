// modules/checkout/checkoutController.js
import { prisma } from '../../config/prismaClient.js'
import { asyncHandler } from '../../middlewares/errorMiddleware.js'
import { PriceResolverService } from '../../services/priceResolverService.js'
import logger from '../../utils/logger.js'
import { successResponse, errorResponse } from '../../utils/responseHelper.js'

const OMS_API_BASE_URL = (process.env.OMS_API_BASE_URL || 'http://localhost:3003/api/v1/oms').replace(/\/$/, '')

/**
 * Helper to call the central OMS API
 */
async function callOmsApi({ path, method = 'POST', body, headers = {} }) {
  const url = `${OMS_API_BASE_URL}${path}`
  logger.info(`[Checkout Gateway] Forwarding checkout to OMS: ${url}`)
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err = new Error(payload?.message || `OMS API call failed: ${response.status}`)
    err.statusCode = response.status
    err.details = payload
    throw err
  }
  return payload
}

/**
 * POST /api/v1/checkout
 * Validates cart, address, and payment, then forwards the request to OMS API
 */
export const processCheckout = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const {
    addressId,
    paymentMethod,
    deliveryType = 'SCHEDULED',
    deliverySlot,
    deliveryDate,
    pickupSlotId,
    specialInstructions,
    couponCode,
    pointsToRedeem
  } = req.body

  logger.info('[Checkout Gateway] Initiating checkout', {
    userId,
    addressId,
    paymentMethod,
    deliveryType
  })

  // 1. Fetch user cart
  const cart = await prisma.cart.findFirst({
    where: { userId },
    include: {
      items: {
        include: {
          product: true,
          productVariant: true
        }
      }
    }
  })

  if (!cart || !cart.items || cart.items.length === 0) {
    return errorResponse(res, 400, 'Cart is empty or not found')
  }

  // 2. Validate Address exists
  const address = await prisma.address.findFirst({
    where: { id: addressId, userId }
  })
  if (!address) {
    return errorResponse(res, 400, 'Invalid or missing delivery address')
  }

  // 3. Map cart items to OMS order lines format, re-resolving prices via PriceResolverService
  const cleanChannel = (channel || 'ONLINE').toUpperCase()
  const orderWarehouseId = cart.warehouseId || req.normalizedWarehouseId
  const targetChannel = orderWarehouseId && ['ONLINE', 'VEHICLE', 'POS'].includes(cleanChannel)
    ? `${cleanChannel}_${orderWarehouseId}`
    : (channel || 'ONLINE')

  const orderItems = []
  for (const item of cart.items) {
    const resolved = await PriceResolverService.resolvePrice({
      productId: item.productId,
      productVariantId: item.productVariantId || null,
      channel: targetChannel,
      quantity: item.quantity
    })
    
    orderItems.push({
      productId: item.productId,
      productVariantId: item.productVariantId || null,
      quantity: item.quantity,
      unitPrice: resolved.sellingPrice
    })
  }

  // 4. Calculate total amount
  const subtotal = orderItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0)
  const totalAmount = Math.round(subtotal * 100) / 100

  // 5. Check payment details or handle payment authorization placeholder
  // If COD, validate if COD is allowed on all products in cart
  let customer = null
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true }
  })
  if (userRecord?.phone) {
    customer = await prisma.customer.findUnique({
      where: {
        tenantId_mobile: {
          tenantId: 'VK001',
          mobile: userRecord.phone
        }
      }
    })
  }

  // Calculate loyalty points discount if requested
  let loyaltyDiscount = 0
  let finalPointsToRedeem = 0
  if (pointsToRedeem && Number(pointsToRedeem) > 0 && customer && customer.loyaltyPoints > 0) {
    finalPointsToRedeem = Math.min(Number(pointsToRedeem), customer.loyaltyPoints)
    loyaltyDiscount = finalPointsToRedeem * 0.10 // 1 point = ₹0.10
    // Cap loyalty discount at 20% of order total amount
    const maxDiscount = Math.round(totalAmount * 0.20 * 100) / 100
    if (loyaltyDiscount > maxDiscount) {
      loyaltyDiscount = maxDiscount
      finalPointsToRedeem = Math.ceil(loyaltyDiscount / 0.10)
    }
  }

  const finalTotalAmount = Math.max(0, Math.round((totalAmount - loyaltyDiscount) * 100) / 100)

  if (paymentMethod === 'COD') {
    const codBlockedProduct = cart.items.find(item => !item.product.isCodAllowed)
    if (codBlockedProduct) {
      return errorResponse(res, 400, `COD is not allowed for product: ${codBlockedProduct.product.name}`)
    }
  } else if (paymentMethod === 'WALLET') {
    if (!customer || customer.creditBalance < finalTotalAmount) {
      return errorResponse(res, 400, 'Insufficient wallet balance')
    }
  }

  // 6. Forward request to OMS Core
  let omsResult
  let balanceDeducted = false
  let pointsDeducted = false
  try {
    const transactionOperations = []

    if (finalPointsToRedeem > 0 && customer) {
      transactionOperations.push(
        prisma.customer.update({
          where: { id: customer.id },
          data: { loyaltyPoints: { decrement: finalPointsToRedeem } }
        }),
        prisma.activityLog.create({
          data: {
            userId,
            action: 'WALLET_DEBIT', // Log under wallet/ledger actions
            details: `Redeemed ${finalPointsToRedeem} loyalty points for checkout discount`,
            metadata: { points: finalPointsToRedeem, discount: loyaltyDiscount, type: 'DEBIT' }
          }
        })
      )
      pointsDeducted = true
    }

    if (paymentMethod === 'WALLET' && customer) {
      transactionOperations.push(
        prisma.customer.update({
          where: { id: customer.id },
          data: { creditBalance: { decrement: finalTotalAmount } }
        }),
        prisma.activityLog.create({
          data: {
            userId,
            action: 'WALLET_DEBIT',
            details: 'Payment for checkout order',
            metadata: { amount: finalTotalAmount, type: 'DEBIT' }
          }
        })
      )
      balanceDeducted = true
    }

    if (transactionOperations.length > 0) {
      await prisma.$transaction(transactionOperations)
    }

    // Generate auth headers if there is a system/user token, or pass user token
    const userAuthHeader = req.headers['authorization'] || ''
    
    omsResult = await callOmsApi({
      path: '/orders/create',
      method: 'POST',
      headers: {
        ...(userAuthHeader ? { Authorization: userAuthHeader } : {})
      },
      body: {
        consumerId: userId,
        addressId,
        orderItems,
        totalAmount: finalTotalAmount,
        orderType: paymentMethod === 'COD' ? 'COD' : (paymentMethod === 'WALLET' ? 'WALLET' : 'ONLINE'),
        customerLocation: address.location || {}
      }
    })
  } catch (err) {
    // Rollback operations on failure
    const rollbackOperations = []
    if (balanceDeducted && customer) {
      rollbackOperations.push(
        prisma.customer.update({
          where: { id: customer.id },
          data: { creditBalance: { increment: finalTotalAmount } }
        }),
        prisma.activityLog.create({
          data: {
            userId,
            action: 'WALLET_CREDIT',
            details: 'Refund for failed order creation',
            metadata: { amount: finalTotalAmount, type: 'CREDIT' }
          }
        })
      )
    }
    if (pointsDeducted && customer) {
      rollbackOperations.push(
        prisma.customer.update({
          where: { id: customer.id },
          data: { loyaltyPoints: { increment: finalPointsToRedeem } }
        }),
        prisma.activityLog.create({
          data: {
            userId,
            action: 'WALLET_CREDIT',
            details: 'Loyalty points refund for failed order creation',
            metadata: { points: finalPointsToRedeem, type: 'CREDIT' }
          }
        })
      )
    }

    if (rollbackOperations.length > 0) {
      try {
        await prisma.$transaction(rollbackOperations)
      } catch (refundErr) {
        logger.error('[Checkout Gateway] Critical: Failed to execute checkout rollback', { userId, error: refundErr.message })
      }
    }
    logger.error('[Checkout Gateway] OMS creation failed', { error: err.message })
    return errorResponse(res, err.statusCode || 500, err.message || 'Checkout failed during OMS order creation', err.details)
  }

  // 7. Clear user cart since checkout was successful on OMS
  try {
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id }
    })
    logger.info('[Checkout Gateway] Cart cleared successfully', { userId, cartId: cart.id })
  } catch (cartErr) {
    logger.error('[Checkout Gateway] Error clearing cart after order success', { error: cartErr.message })
  }

  // 8. Return success response with OMS order details
  return successResponse(res, 201, {
    message: 'Checkout completed and order created successfully',
    omsOrder: omsResult.data
  })
})
