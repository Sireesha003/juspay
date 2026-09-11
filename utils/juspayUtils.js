// utils/juspayUtils.js
import crypto from 'crypto'
import logger from './logger.js'

/**
 * Resolve Juspay configuration from environment
 */
export function getJuspayConfig() {
  const apiKey =
    process.env.JUSPAY_API_KEY || 'key_live_d0f7307db6cd42fd86e44e2eb74f5920'
  const merchantId = process.env.JUSPAY_MERCHANT_ID || 'villagkart'
  const defaultBaseUrl = apiKey.startsWith('key_live_')
    ? 'https://api.juspay.in'
    : 'https://smartgatewayuat.juspay.in'
  const baseUrl = (process.env.JUSPAY_BASE_URL || defaultBaseUrl).replace(/\/$/, '')

  return {
    apiKey,
    merchantId,
    baseUrl
  }
}

/**
 * Generate standard Juspay request headers
 */
function getJuspayHeaders(apiKey, merchantId) {
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
  return {
    Authorization: authHeader,
    'x-merchantid': merchantId,
    'Content-Type': 'application/json'
  }
}

/**
 * 1. Create Juspay Checkout Session
 * Calls POST /session
 * @param {Object} params
 * @param {string} params.orderId
 * @param {number} params.amount
 * @param {string} params.customerId
 * @param {string} [params.customerEmail]
 * @param {string} [params.customerPhone]
 * @param {string} [params.returnUrl]
 * @returns {Promise<Object>} Juspay session response with sdk_payload and payment_links
 */
export async function createJuspaySession({
  orderId,
  amount,
  customerId,
  customerEmail,
  customerPhone,
  returnUrl
}) {
  const { apiKey, merchantId, baseUrl } = getJuspayConfig()

  if (!apiKey) {
    throw new Error('Juspay API key is not configured')
  }

  const endpoint = `${baseUrl}/session`
  const formattedAmount = Number(amount).toFixed(2)

  const payload = {
    order_id: String(orderId),
    amount: formattedAmount,
    customer_id: String(customerId || 'guest'),
    payment_page_client_id: merchantId,
    action: 'paymentPage',
    currency: 'INR'
  }

  if (customerEmail) payload.customer_email = String(customerEmail)
  if (customerPhone) payload.customer_phone = String(customerPhone).replace(/\D/g, '').slice(-10)
  if (returnUrl) payload.return_url = returnUrl

  logger.info('[Juspay] Creating checkout session', {
    orderId,
    amount: formattedAmount,
    customerId,
    endpoint
  })

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getJuspayHeaders(apiKey, merchantId),
      body: JSON.stringify(payload)
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const errorMsg =
        data.error_message ||
        data.message ||
        data.status_message ||
        `Juspay session creation failed with status ${response.status}`
      logger.error('[Juspay] Session creation failed', {
        status: response.status,
        error: errorMsg,
        data
      })
      const error = new Error(errorMsg)
      error.statusCode = response.status
      error.raw = data
      throw error
    }

    logger.info('[Juspay] Session created successfully', {
      orderId,
      status: data.status,
      hasSdkPayload: Boolean(data.sdk_payload),
      hasPaymentLinks: Boolean(data.payment_links)
    })

    return data
  } catch (error) {
    logger.error('[Juspay] Error in createJuspaySession', {
      orderId,
      error: error.message
    })
    throw error
  }
}

/**
 * 2. Get Juspay Order Status (Server-to-Server Verification)
 * Calls GET /orders/:orderId
 * @param {string} orderId
 * @returns {Promise<Object>} Juspay order status response
 */
export async function getJuspayOrderStatus(orderId) {
  const { apiKey, merchantId, baseUrl } = getJuspayConfig()

  if (!apiKey) {
    throw new Error('Juspay API key is not configured')
  }

  const endpoint = `${baseUrl}/orders/${encodeURIComponent(orderId)}`

  logger.info('[Juspay] Fetching order status', { orderId, endpoint })

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        ...getJuspayHeaders(apiKey, merchantId),
        version: '2021-10-10'
      }
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const errorMsg =
        data.error_message ||
        data.message ||
        `Juspay order status request failed with status ${response.status}`
      logger.error('[Juspay] Order status fetch failed', {
        status: response.status,
        error: errorMsg,
        data
      })
      const error = new Error(errorMsg)
      error.statusCode = response.status
      error.raw = data
      throw error
    }

    logger.info('[Juspay] Order status fetched successfully', {
      orderId,
      status: data.status,
      txnId: data.txn_id || data.id
    })

    return data
  } catch (error) {
    logger.error('[Juspay] Error in getJuspayOrderStatus', {
      orderId,
      error: error.message
    })
    throw error
  }
}

/**
 * 3. Verify Juspay Webhook Signature
 * Validates HMAC-SHA256 signature against JUSPAY_WEBHOOK_SECRET
 * @param {Object|string} payload - Webhook payload
 * @param {string} signature - Incoming signature from request headers
 * @returns {boolean}
 */
export function verifyJuspayWebhookSignature(payload, signature) {
  try {
    const webhookSecret =
      process.env.JUSPAY_WEBHOOK_SECRET ||
      process.env.JUSPAY_API_KEY ||
      'key_live_d0f7307db6cd42fd86e44e2eb74f5920'

    if (!webhookSecret) {
      logger.warn('[Juspay] Webhook secret not configured')
      return false
    }

    if (!signature) {
      logger.warn('[Juspay] Webhook signature missing in headers')
      return false
    }

    const payloadText =
      typeof payload === 'string' ? payload : JSON.stringify(payload)

    const expectedHex = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadText)
      .digest('hex')

    const expectedBase64 = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadText)
      .digest('base64')

    const cleanSignature = String(signature).trim()
    const isValid =
      cleanSignature === expectedHex || cleanSignature === expectedBase64

    logger.info('[Juspay] Webhook signature verification result', {
      isValid,
      usingWebhookSecret: Boolean(process.env.JUSPAY_WEBHOOK_SECRET)
    })

    return isValid
  } catch (error) {
    logger.error('[Juspay] Error verifying webhook signature', {
      error: error.message
    })
    return false
  }
}

/**
 * 4. Create Juspay Refund
 * Calls POST /orders/:orderId/refunds
 * @param {string} orderId - Merchant order ID
 * @param {number} amount - Refund amount in rupees
 * @param {string} uniqueRequestId - Unique idempotency key for refund
 * @returns {Promise<Object>} Juspay refund response
 */
export async function createJuspayRefund(orderId, amount, uniqueRequestId) {
  const { apiKey, merchantId, baseUrl } = getJuspayConfig()

  if (!apiKey) {
    throw new Error('Juspay API key is not configured')
  }

  const endpoint = `${baseUrl}/orders/${encodeURIComponent(orderId)}/refunds`
  const formattedAmount = Number(amount).toFixed(2)
  const reqId =
    uniqueRequestId ||
    `ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  const payload = {
    unique_request_id: reqId,
    amount: formattedAmount
  }

  logger.info('[Juspay] Creating refund', {
    orderId,
    amount: formattedAmount,
    uniqueRequestId: reqId,
    endpoint
  })

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getJuspayHeaders(apiKey, merchantId),
      body: JSON.stringify(payload)
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const errorMsg =
        data.error_message ||
        data.message ||
        `Juspay refund failed with status ${response.status}`
      logger.error('[Juspay] Refund failed', {
        status: response.status,
        error: errorMsg,
        data
      })
      const error = new Error(errorMsg)
      error.statusCode = response.status
      error.raw = data
      throw error
    }

    logger.info('[Juspay] Refund processed successfully', {
      orderId,
      refundId: data.id,
      status: data.status,
      amount: formattedAmount
    })

    return data
  } catch (error) {
    logger.error('[Juspay] Error in createJuspayRefund', {
      orderId,
      error: error.message
    })
    throw error
  }
}
