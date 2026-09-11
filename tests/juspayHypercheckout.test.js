import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import {
  getJuspayConfig,
  verifyJuspayWebhookSignature
} from '../utils/juspayUtils.js'
import {
  initiatePaymentValidation,
  verifyJuspayPaymentValidation,
  juspayWebhookValidation
} from '../validations/paymentsValidation.js'
import paymentsRouter from '../routes/payments.router.js'
import {
  verifyJuspayPayment,
  juspayWebhook
} from '../controllers/paymentsController.js'

test('Juspay Hypercheckout Integration Suite', async (t) => {
  await t.test('1. Juspay Configuration', () => {
    const config = getJuspayConfig()
    assert.equal(config.apiKey, 'key_live_d0f7307db6cd42fd86e44e2eb74f5920')
    assert.equal(config.baseUrl, 'https://api.juspay.in')
    assert.ok(config.merchantId)
  })

  await t.test('2. Webhook Signature Verification', () => {
    const payload = {
      event_name: 'ORDER_SUCCEEDED',
      order_id: 'VK-ORD-98765',
      status: 'CHARGED'
    }
    const payloadStr = JSON.stringify(payload)
    const secret = 'key_live_d0f7307db6cd42fd86e44e2eb74f5920'

    const hexSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex')
    const base64Sig = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64')

    assert.equal(verifyJuspayWebhookSignature(payload, hexSig), true)
    assert.equal(verifyJuspayWebhookSignature(payload, base64Sig), true)
    assert.equal(verifyJuspayWebhookSignature(payload, 'wrong_signature'), false)
    assert.equal(verifyJuspayWebhookSignature(payload, null), false)
  })

  await t.test('3. Payment Validation Rules', () => {
    assert.ok(Array.isArray(initiatePaymentValidation))
    assert.ok(Array.isArray(verifyJuspayPaymentValidation))
    assert.ok(Array.isArray(juspayWebhookValidation))

    // Ensure verifyJuspayPayment and juspayWebhook are functions
    assert.equal(typeof verifyJuspayPayment, 'function')
    assert.equal(typeof juspayWebhook, 'function')
  })

  await t.test('4. Payments Router Routes Registered', () => {
    assert.ok(paymentsRouter)
    assert.ok(Array.isArray(paymentsRouter.stack))

    const registeredPaths = paymentsRouter.stack
      .map((layer) => layer.route?.path)
      .filter(Boolean)

    assert.ok(
      registeredPaths.includes('/juspay/webhook'),
      'Router must have /juspay/webhook registered'
    )
    assert.ok(
      registeredPaths.includes('/juspay/verify'),
      'Router must have /juspay/verify registered'
    )
  })
})
