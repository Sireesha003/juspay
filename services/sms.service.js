/**
 * MSG91 OTP SMS via official Node SDK (`msg91` npm) — Flow API.
 *
 * Usage matches MSG91 docs: initialize(authKey), getSMS().send(flowId, { mobile, var1, var2 }, { senderId, shortURL }).
 * SDK merges a flat JSON body to POST https://api.msg91.com/api/v5/flow/ (adds `mobiles` from `mobile`).
 *
 * We still pass `route` / `unicode` on the recipient object so they are included in the body (India transactional OTP).
 *
 * Variable keys: default `var1`/`var2` for DLT ##var1##/##var2##; set MSG91_USE_UPPERCASE_FLOW_VARS=true for VAR1/VAR2.
 *
 * @see https://github.com/Walkover-Web-Solution/SendSMS-node-MSG91
 * @see https://api.msg91.com/apidoc/textsms/send-sms-flow.php
 */

import msg91Import from 'msg91'
import config from '../config/config.js'
import logger from '../utils/logger.js'

/** ESM interop: package exposes nested default */
const msg91Client = msg91Import.default ?? msg91Import

const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 400
/** DLT variable length safety (approved template “Dear ##var1## …”) */
const VAR1_MAX_LEN = 40

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Build MSG91 mobile: country code digits + phone digits (e.g. 919876543210).
 */
export function normalizeMsg91Mobile(phone, countryCode = '+91') {
  const cc = String(countryCode || '').replace(/\D/g, '')
  const num = String(phone || '').replace(/\D/g, '')
  return `${cc}${num}`
}

function maskMobileForLog(mobile) {
  if (!mobile || String(mobile).length < 5) return '***'
  return String(mobile).replace(/\d(?=\d{4})/g, 'X')
}

function ensureMsg91Initialized(authKey) {
  if (!authKey) return
  try {
    if (!msg91Client.initialized) {
      msg91Client.initialize({ authKey })
    }
  } catch (err) {
    if (!String(err.message || '').includes('already initialized')) {
      throw err
    }
  }
}

function sdkErrorMessage(err) {
  if (err == null) return 'SMS gateway request failed'
  if (typeof err.message === 'string' && err.message) return err.message
  const data = err.response?.data
  if (data && typeof data.message === 'string') return data.message
  return String(err)
}

/**
 * Send OTP SMS via MSG91 Flow (DLT: name → var1, OTP → var2 by default).
 * @param {{ mobile: string, name: string, otp: string }} params
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string }>}
 */
export async function sendOTP({ mobile, name, otp }) {
  const authKey = config.msg91?.authKey || ''
  const flowId = config.msg91?.flowId
  const sender = config.msg91?.sender
  const env = config.app?.environment || process.env.NODE_ENV || 'development'

  if (!authKey) {
    if (env === 'production') {
      logger.error('MSG91 SMS skipped: MSG91_AUTH_KEY not set in production', {
        env,
        mobile: maskMobileForLog(mobile)
      })
      return { ok: false, error: 'SMS service is not configured' }
    }
    logger.warn('MSG91 SMS skipped: MSG91_AUTH_KEY not set (non-production)', {
      env,
      mobile: maskMobileForLog(mobile)
    })
    console.log(`🔑 [SMS Development Bypass - No AuthKey] OTP for ${mobile}: ${otp}`)
    return { ok: true, skipped: true }
  }

  let var1 = String(name || 'Customer').trim() || 'Customer'
  if (var1.length > VAR1_MAX_LEN) {
    var1 = var1.slice(0, VAR1_MAX_LEN)
  }
  const var2 = String(otp || '').trim()
  if (!var2) {
    logger.error('MSG91 sendOTP: empty OTP', {
      mobile: maskMobileForLog(mobile),
      recipientNameLength: var1.length
    })
    return { ok: false, error: 'Invalid OTP payload' }
  }

  const useUppercase =
    process.env.MSG91_USE_UPPERCASE_FLOW_VARS === 'true' ||
    process.env.MSG91_USE_UPPERCASE_FLOW_VARS === '1'

  const recipient = {
    mobile,
    ...(useUppercase
      ? { VAR1: var1, VAR2: var2 }
      : { var1: var1, var2: var2 })
  }

  if (config.msg91?.route != null && String(config.msg91.route).length > 0) {
    recipient.route = config.msg91.route
  }
  if (config.msg91?.unicode != null && String(config.msg91.unicode).length > 0) {
    const u = parseInt(String(config.msg91.unicode), 10)
    if (!Number.isNaN(u)) recipient.unicode = u
  }

  const sendOptions = {
    senderId: sender,
    shortURL: false
  }

  const mobileMasked = maskMobileForLog(mobile)
  logger.info('MSG91 Flow dispatch (official SDK)', {
    flowId,
    senderId: sender,
    route: recipient.route ?? null,
    unicode: recipient.unicode ?? null,
    flowVarKeys: useUppercase ? 'VAR1,VAR2' : 'var1,var2',
    mobile: mobileMasked,
    recipientNameLength: var1.length,
    maxAttempts: MAX_ATTEMPTS,
    env
  })

  ensureMsg91Initialized(authKey)
  const sms = msg91Client.getSMS()

  let lastError = 'SMS gateway request failed'

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptStart = Date.now()
    logger.debug('MSG91 SDK send attempt', {
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      mobile: mobileMasked
    })

    try {
      const result = await sms.send(String(flowId), recipient, sendOptions)
      const elapsedMs = Date.now() - attemptStart
      const requestId =
        result && typeof result.message === 'string' ? result.message : undefined

      logger.debug('MSG91 SDK send response', {
        attempt,
        elapsedMs,
        requestId: requestId || null
      })

      if (requestId) {
        logger.info('MSG91 OTP SMS accepted by gateway', {
          mobile: mobileMasked,
          attempt,
          elapsedMs,
          requestId,
          route: recipient.route ?? null,
          unicode: recipient.unicode ?? null
        })
        logger.info(
          'MSG91: API accepted — if no row in panel, confirm authkey account, SMS logs section, and Flow ID in SMS→Flow. Search requestId in reports.',
          { requestId }
        )
        return { ok: true }
      }

      lastError = 'Unexpected MSG91 response (no message id)'
      logger.warn('MSG91 SDK unexpected success shape', { attempt, result })
    } catch (err) {
      const elapsedMs = Date.now() - attemptStart
      lastError = sdkErrorMessage(err)
      logger.warn('MSG91 SDK send error', {
        attempt,
        elapsedMs,
        error: lastError
      })
    }

    if (attempt < MAX_ATTEMPTS) {
      const delayMs = BASE_DELAY_MS * attempt
      logger.info('MSG91 Flow retry scheduled', {
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        mobile: mobileMasked
      })
      await sleep(delayMs)
    }
  }

  logger.error('MSG91 OTP SMS exhausted retries', {
    error: lastError,
    maxAttempts: MAX_ATTEMPTS,
    mobile: mobileMasked,
    flowId
  })

  if (env !== 'production') {
    logger.warn('MSG91 SMS failed, but falling back to terminal log because we are in development mode.', {
      env,
      otp
    })
    console.log(`🔑 [SMS Development Bypass Fallback] OTP for ${mobile}: ${otp}`)
    return { ok: true, skipped: true }
  }

  return { ok: false, error: lastError }
}
