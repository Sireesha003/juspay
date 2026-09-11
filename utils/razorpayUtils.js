// utils/razorpayUtils.js
import Razorpay from 'razorpay'
import crypto from 'crypto'
import logger from './logger.js'

let razorpayInstance = null

/**
 * Initialize Razorpay instance
 */
export function getRazorpayInstance() {
  if (!razorpayInstance) {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET

    if (!keyId || !keySecret) {
      logger.warn('[Razorpay] Razorpay credentials not configured')
      return null
    }

    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    })

    logger.info('[Razorpay] Razorpay instance initialized')
  }

  return razorpayInstance
}

/**
 * Create Razorpay order
 */
export async function createRazorpayOrder(amount, currency = 'INR', receipt = null) {
  try {
    const razorpay = getRazorpayInstance()
    if (!razorpay) {
      throw new Error('Razorpay not configured')
    }

    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency,
      receipt: receipt || `receipt_${Date.now()}`
    }

    const order = await razorpay.orders.create(options)

    logger.info('[Razorpay] Order created', {
      razorpayOrderId: order.id,
      amount: options.amount
    })

    return order
  } catch (error) {
    logger.error('[Razorpay] Error creating order', {
      error: error.message,
      amount
    })
    throw error
  }
}

/**
 * Verify Razorpay payment signature
 */
export function verifyPaymentSignature(orderId, paymentId, signature) {
  try {
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET
    if (!razorpaySecret) {
      logger.warn('[Razorpay] Razorpay secret not configured')
      return false
    }

    const text = `${orderId}|${paymentId}`
    const generatedSignature = crypto
      .createHmac('sha256', razorpaySecret)
      .update(text)
      .digest('hex')

    const isValid = generatedSignature === signature

    logger.info('[Razorpay] Signature verification', {
      isValid,
      orderId,
      paymentId
    })

    return isValid
  } catch (error) {
    logger.error('[Razorpay] Error verifying signature', {
      error: error.message
    })
    return false
  }
}

/**
 * Verify Razorpay webhook signature
 * CRITICAL: Uses RAZORPAY_WEBHOOK_SECRET (separate from API key secret for security)
 */
export function verifyWebhookSignature(payload, signature) {
  try {
    // Use webhook secret (required for security), fallback to key secret for backward compatibility
    const razorpaySecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET
    if (!razorpaySecret) {
      logger.warn('[Razorpay] Razorpay webhook secret not configured')
      return false
    }

    // Log warning if using fallback (for migration period)
    if (!process.env.RAZORPAY_WEBHOOK_SECRET && process.env.RAZORPAY_KEY_SECRET) {
      logger.warn('[Razorpay] Using RAZORPAY_KEY_SECRET as fallback. Please set RAZORPAY_WEBHOOK_SECRET for production.')
    }

    const text = JSON.stringify(payload)
    const generatedSignature = crypto
      .createHmac('sha256', razorpaySecret)
      .update(text)
      .digest('hex')

    const isValid = generatedSignature === signature

    logger.info('[Razorpay] Webhook signature verification', {
      isValid,
      usingWebhookSecret: !!process.env.RAZORPAY_WEBHOOK_SECRET
    })

    return isValid
  } catch (error) {
    logger.error('[Razorpay] Error verifying webhook signature', {
      error: error.message
    })
    return false
  }
}

/**
 * Capture Razorpay payment
 */
export async function capturePayment(paymentId, amount) {
  try {
    const razorpay = getRazorpayInstance()
    if (!razorpay) {
      throw new Error('Razorpay not configured')
    }

    const payment = await razorpay.payments.capture(paymentId, Math.round(amount * 100))

    logger.info('[Razorpay] Payment captured', {
      paymentId,
      amount: Math.round(amount * 100)
    })

    return payment
  } catch (error) {
    logger.error('[Razorpay] Error capturing payment', {
      error: error.message,
      paymentId
    })
    throw error
  }
}

/**
 * Refund Razorpay payment
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Refund amount (in rupees)
 * @param {object} notes - Optional notes for refund
 * @returns {Promise<object>} Refund object
 */
export async function refundPayment(paymentId, amount, notes = {}) {
  try {
    const razorpay = getRazorpayInstance()
    if (!razorpay) {
      throw new Error('Razorpay not configured')
    }

    const refundOptions = {
      amount: Math.round(amount * 100), // Convert to paise
      notes: {
        reason: 'Order cancelled by customer',
        ...notes
      }
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions)

    logger.info('[Razorpay] Payment refunded', {
      paymentId,
      refundId: refund.id,
      amount: refundOptions.amount
    })

    return refund
  } catch (error) {
    logger.error('[Razorpay] Error refunding payment', {
      error: error.message,
      paymentId,
      amount
    })
    throw error
  }
}

