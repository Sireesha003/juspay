// utils/otpService.js
import crypto from 'crypto'
import { prisma } from '../config/prismaClient.js'
import {
  generateOTP,
  calculateOtpExpiry,
  isWithinCooldown,
  getRemainingCooldownSeconds
} from './otpUtils.js'
import config from '../config/config.js'
import logger from './logger.js'

// In-memory OTP store
const otpStore = new Map()

// OTP rate limiting per phone number
const otpRateLimit = new Map()
const resendOtpRateLimit = new Map()

/**
 * Store OTP for a phone number
 * @param {string} phone - Phone number
 * @param {string} countryCode - Country code
 * @returns {string} - Generated OTP
 */
export const storeOTP = async (phone, countryCode = '+91') => {
  const fullPhone = `${countryCode}${phone}`

  console.log('📱 [OTP Service] Request to store OTP:', {
    phone: fullPhone,
    timestamp: new Date().toISOString(),
    cooldownMinutes: config.otp.cooldownMinutes
  })

  // Check rate limiting
  const lastSent = otpRateLimit.get(fullPhone)
  console.log('⏱️  [OTP Service] Rate limit check:', {
    phone: fullPhone,
    lastSent: lastSent ? lastSent.toISOString() : null,
    hasLastSent: !!lastSent,
    isWithinCooldown: lastSent
      ? isWithinCooldown(lastSent, config.otp.cooldownMinutes)
      : false
  })

  if (lastSent && isWithinCooldown(lastSent, config.otp.cooldownMinutes)) {
    const remaining = Math.ceil(
      (config.otp.cooldownMinutes * 60 * 1000 -
        (Date.now() - lastSent.getTime())) /
        1000
    )
    console.log('🚫 [OTP Service] Rate limit exceeded:', {
      phone: fullPhone,
      lastSent: lastSent.toISOString(),
      elapsedSeconds: Math.floor((Date.now() - lastSent.getTime()) / 1000),
      remainingSeconds: remaining,
      cooldownMinutes: config.otp.cooldownMinutes
    })
    throw new Error(
      `Please wait ${remaining} seconds before requesting a new OTP`
    )
  }

  // Generate OTP
  const otp = generateOTP()
  const expiresAt = calculateOtpExpiry()

  // Store in memory (and optionally in database Session table)
  otpStore.set(fullPhone, {
    otp,
    expiresAt,
    attempts: 0,
    createdAt: new Date()
  })

  // Update rate limit
  const now = new Date()
  otpRateLimit.set(fullPhone, now)
  console.log('✅ [OTP Service] OTP stored and rate limit updated:', {
    phone: fullPhone,
    otpStored: true,
    rateLimitSetAt: now.toISOString(),
    nextAllowedAt: new Date(
      now.getTime() + config.otp.cooldownMinutes * 60 * 1000
    ).toISOString()
  })

  // Also store in database Session table for persistence (hashed)
  try {
    // Find or create a session entry for this phone
    const existingSession = await prisma.session.findFirst({
      where: {
        user: {
          phone: phone,
          countryCode: countryCode
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (existingSession) {
      const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex')
      await prisma.session.update({
        where: { id: existingSession.id },
        data: {
          otp: hashedOtp,
          expiresAt
        }
      })
    } else {
      // Create a temporary session entry (user might not exist yet)
      // We'll need to handle this differently - store in a separate OTP table or use existing user
      // For now, we'll just use in-memory storage
    }
  } catch (error) {
    logger.warn('Failed to store OTP in database, using in-memory only', {
      error: error.message
    })
  }

  logger.info('OTP generated and stored', {
    phone: fullPhone,
    expiresAt: expiresAt.toISOString()
  })

  return otp
}

/**
 * Roll back in-memory OTP + send rate limit after SMS failure (send-otp flow).
 */
export const rollbackOtpAfterFailedSendSms = (phone, countryCode = '+91') => {
  const fullPhone = `${countryCode}${phone}`
  otpStore.delete(fullPhone)
  otpRateLimit.delete(fullPhone)
}

/**
 * Roll back after SMS failure on resend so the user can call send-otp again.
 */
export const rollbackOtpAfterFailedResendSms = (phone, countryCode = '+91') => {
  const fullPhone = `${countryCode}${phone}`
  otpStore.delete(fullPhone)
  resendOtpRateLimit.delete(fullPhone)
  otpRateLimit.delete(fullPhone)
}

/**
 * Resend OTP for a phone number (with separate rate limiting)
 * @param {string} phone - Phone number
 * @param {string} countryCode - Country code
 * @returns {string} - Generated OTP
 */
export const resendOTP = async (phone, countryCode = '+91') => {
  const fullPhone = `${countryCode}${phone}`

  // Check resend rate limiting (more lenient - 1 minute cooldown)
  const lastResent = resendOtpRateLimit.get(fullPhone)
  const resendCooldownMinutes = config.otp.resendCooldownMinutes || 1

  if (lastResent && isWithinCooldown(lastResent, resendCooldownMinutes)) {
    const remaining = Math.ceil(
      (resendCooldownMinutes * 60 * 1000 -
        (Date.now() - lastResent.getTime())) /
        1000
    )
    throw new Error(`Please wait ${remaining} seconds before resending OTP`)
  }

  // Check if an OTP was previously sent (optional check)
  const existingOtp = otpStore.get(fullPhone)
  if (!existingOtp) {
    throw new Error('No OTP found. Please use send-otp endpoint first.')
  }

  // Generate new OTP
  const otp = generateOTP()
  const expiresAt = calculateOtpExpiry()

  // Update OTP in memory
  otpStore.set(fullPhone, {
    otp,
    expiresAt,
    attempts: 0, // Reset attempts
    createdAt: new Date()
  })

  // Update resend rate limit
  resendOtpRateLimit.set(fullPhone, new Date())

  // Also update in database if session exists
  try {
    const existingSession = await prisma.session.findFirst({
      where: {
        user: {
          phone: phone,
          countryCode: countryCode
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (existingSession) {
      const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex')
      await prisma.session.update({
        where: { id: existingSession.id },
        data: {
          otp: hashedOtp,
          expiresAt
        }
      })
    }
  } catch (error) {
    logger.warn('Failed to update OTP in database, using in-memory only', {
      error: error.message
    })
  }

  logger.info('OTP resent', {
    phone: fullPhone,
    expiresAt: expiresAt.toISOString()
  })

  return otp
}

/**
 * Verify OTP for a phone number
 * @param {string} phone - Phone number
 * @param {string} countryCode - Country code
 * @param {string} otp - OTP to verify
 * @returns {boolean} - True if OTP is valid
 */
export const verifyOTP = async (phone, countryCode = '+91', otp) => {
  const fullPhone = `${countryCode}${phone}`
  const stored = otpStore.get(fullPhone)

  if (!stored) {
    logger.warn('OTP verification failed - no OTP found', { phone: fullPhone })
    return false
  }

  // Check if expired
  if (new Date() > stored.expiresAt) {
    otpStore.delete(fullPhone)
    logger.warn('OTP verification failed - expired', { phone: fullPhone })
    return false
  }

  // Check attempts (max 5 attempts)
  if (stored.attempts >= 5) {
    otpStore.delete(fullPhone)
    logger.warn('OTP verification failed - max attempts reached', {
      phone: fullPhone
    })
    return false
  }

  // Verify OTP
  if (stored.otp !== otp) {
    stored.attempts++
    logger.warn('OTP verification failed - incorrect OTP', {
      phone: fullPhone,
      attempts: stored.attempts
    })
    return false
  }

  // OTP verified successfully - remove it
  otpStore.delete(fullPhone)
  logger.info('OTP verified successfully', { phone: fullPhone })
  return true
}

/**
 * Clean up expired OTPs (call periodically)
 */
export const cleanupExpiredOTPs = () => {
  const now = new Date()
  let cleaned = 0

  for (const [phone, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(phone)
      cleaned++
    }
  }

  if (cleaned > 0) {
    logger.debug('Cleaned up expired OTPs', { count: cleaned })
  }
}

/**
 * Get rate limit status for a phone number (for debugging)
 * @param {string} phone - Phone number
 * @param {string} countryCode - Country code
 * @returns {object} - Rate limit status
 */
export const getRateLimitStatus = (phone, countryCode = '+91') => {
  const fullPhone = `${countryCode}${phone}`
  const lastSent = otpRateLimit.get(fullPhone)
  const lastResent = resendOtpRateLimit.get(fullPhone)

  const status = {
    phone: fullPhone,
    lastSent: lastSent
      ? {
          timestamp: lastSent.toISOString(),
          isWithinCooldown: isWithinCooldown(
            lastSent,
            config.otp.cooldownMinutes
          ),
          remainingSeconds: lastSent
            ? getRemainingCooldownSeconds(lastSent, config.otp.cooldownMinutes)
            : 0
        }
      : null,
    lastResent: lastResent
      ? {
          timestamp: lastResent.toISOString(),
          isWithinCooldown: isWithinCooldown(
            lastResent,
            config.otp.resendCooldownMinutes
          ),
          remainingSeconds: lastResent
            ? getRemainingCooldownSeconds(
                lastResent,
                config.otp.resendCooldownMinutes
              )
            : 0
        }
      : null,
    cooldownMinutes: config.otp.cooldownMinutes,
    resendCooldownMinutes: config.otp.resendCooldownMinutes
  }

  console.log('📊 [OTP Service] Rate limit status:', status)
  return status
}

// Clean up expired OTPs every 5 minutes
setInterval(cleanupExpiredOTPs, 5 * 60 * 1000)
