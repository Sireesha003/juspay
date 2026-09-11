// controllers/authController.js
import { prisma } from '../config/prismaClient.js'
import {
  storeOTP,
  resendOTP,
  verifyOTP,
  rollbackOtpAfterFailedSendSms,
  rollbackOtpAfterFailedResendSms
} from '../utils/otpService.js'
import { sendOTP, normalizeMsg91Mobile } from '../services/sms.service.js'
import { generateUserToken, generateRefreshToken, verifyToken } from '../utils/jwtUtils.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { generateInviteRefCode } from '../utils/userUtils.js'
import { uploadFilesToS3 } from '../utils/aws3.js'

/**
 * Calculate if user profile is complete
 */
const calculateProfileComplete = (user) => {
  const hasName = !!user.name
  const hasAddress = user.addresses && user.addresses.length > 0

  return hasName && hasAddress
}

/**
 * Get missing profile fields
 */
const getMissingFields = (user) => {
  const missing = []
  if (!user.name) missing.push('name')
  if (!user.addresses || user.addresses.length === 0) missing.push('address')
  return missing
}

/**
 * Send OTP to phone number
 * POST /api/v1/user/send-otp
 */
export const sendOtp = asyncHandler(async (req, res) => {
  const { phone, countryCode = '+91' } = req.body

  // Static Apple Review Credentials
  const APPLE_REVIEW_PHONE = '9063516497'
  const APPLE_REVIEW_OTP = '123456'

  // Validate phone number format
  const phoneRegex = /^\d{10,15}$/
  if (!phoneRegex.test(phone)) {
    return errorResponse(res, 400, 'Invalid phone number format')
  }

  try {
    console.log('🔔 [Auth Controller] Send OTP request received:', {
      phone,
      countryCode,
      timestamp: new Date().toISOString()
    })

    const existingUser = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, name: true }
    })

    if (phone === APPLE_REVIEW_PHONE) {
      logger.info('Apple Review OTP send bypass used', { phone })
      const response = {
        message: 'OTP sent successfully',
        isNewUser: !existingUser
      }
      return successResponse(res, 200, response, 'OTP sent successfully')
    }

    const displayName =
      (existingUser?.name && String(existingUser.name).trim()) || 'Customer'

    const otp = await storeOTP(phone, countryCode)

    console.log('✅ [Auth Controller] OTP generated successfully:', {
      phone: `${countryCode}${phone}`,
      otpLength: otp.length
    })

    const smsResult = await sendOTP({
      mobile: normalizeMsg91Mobile(phone, countryCode),
      name: displayName,
      otp
    })

    if (!smsResult.ok) {
      rollbackOtpAfterFailedSendSms(phone, countryCode)

      logger.error('OTP SMS delivery failed', {
        phone: `${countryCode}${phone}`,
        error: smsResult.error
      })

      return errorResponse(
        res,
        503,
        'Unable to send OTP. Please try again shortly.'
      )
    }

    logger.info('OTP sent', {
      phone: `${countryCode}${phone}`,
      smsSkipped: !!smsResult.skipped,
      otp: process.env.NODE_ENV === 'development' ? otp : '***'
    })

    const response = {
      message: 'OTP sent successfully',
      isNewUser: !existingUser
    }

    if (process.env.NODE_ENV === 'development') {
      response.otp = otp
    }

    return successResponse(res, 200, response, 'OTP sent successfully')
  } catch (error) {
    console.error('❌ [Auth Controller] Error sending OTP:', {
      error: error.message,
      phone: `${countryCode}${phone}`,
      stack: error.stack,
      isRateLimit: error.message.includes('wait')
    })

    logger.error('Error sending OTP', {
      error: error.message,
      phone: `${countryCode}${phone}`
    })

    if (error.message.includes('wait')) {
      return errorResponse(res, 429, error.message)
    }

    return errorResponse(res, 500, 'Failed to send OTP. Please try again.')
  }
})

/**
 * Resend OTP to phone number
 * POST /api/v1/user/resend-otp
 */
export const resendOtp = asyncHandler(async (req, res) => {
  const { phone, countryCode = '+91' } = req.body

  // Validate phone number format
  const phoneRegex = /^\d{10,15}$/
  if (!phoneRegex.test(phone)) {
    return errorResponse(res, 400, 'Invalid phone number format')
  }

  // Static Apple Review Credentials
  const APPLE_REVIEW_PHONE = '9063516497'
  const APPLE_REVIEW_OTP = '123456'

  if (phone === APPLE_REVIEW_PHONE) {
    return successResponse(
      res,
      200,
      {
        message: 'OTP resent successfully',
        otp: APPLE_REVIEW_OTP
      },
      'OTP resent successfully'
    )
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { phone },
      select: { name: true }
    })
    const displayName =
      (existingUser?.name && String(existingUser.name).trim()) || 'Customer'

    const otp = await resendOTP(phone, countryCode)

    const smsResult = await sendOTP({
      mobile: normalizeMsg91Mobile(phone, countryCode),
      name: displayName,
      otp
    })

    if (!smsResult.ok) {
      rollbackOtpAfterFailedResendSms(phone, countryCode)
      logger.error('OTP resend SMS delivery failed', {
        phone: `${countryCode}${phone}`,
        error: smsResult.error
      })
      return errorResponse(
        res,
        503,
        'Unable to send OTP. Please try again shortly.'
      )
    }

    logger.info('OTP resent', {
      phone: `${countryCode}${phone}`,
      smsSkipped: !!smsResult.skipped,
      otp: process.env.NODE_ENV === 'development' ? otp : '***'
    })

    const response = {
      message: 'OTP resent successfully'
    }

    if (process.env.NODE_ENV === 'development') {
      response.otp = otp
    }

    return successResponse(res, 200, response, 'OTP resent successfully')
  } catch (error) {
    logger.error('Error resending OTP', {
      error: error.message,
      phone: `${countryCode}${phone}`
    })

    if (error.message.includes('wait')) {
      return errorResponse(res, 429, error.message)
    }

    if (error.message.includes('No OTP found')) {
      return errorResponse(res, 400, error.message)
    }

    return errorResponse(res, 500, 'Failed to resend OTP. Please try again.')
  }
})

/**
 * Verify OTP and login/register user
 * POST /api/v1/user/verify-otp
 */
export const verifyOtp = asyncHandler(async (req, res) => {
  const {
    phone,
    countryCode = '+91',
    otp,
    deviceId,
    fcmToken,
    referralCode
  } = req.body

  try {
    // Verify OTP
    // Static Apple Review Credentials
    const APPLE_REVIEW_PHONE = '9063516497'
    const APPLE_REVIEW_OTP = '123456'

    let isValid = false

    if (phone === APPLE_REVIEW_PHONE && otp === APPLE_REVIEW_OTP) {
      isValid = true

      logger.info('Apple Review OTP verification bypass used', {
        phone: `${countryCode}${phone}`
      })
    } else {
      isValid = await verifyOTP(phone, countryCode, otp)
    }

    if (!isValid) {
      return errorResponse(res, 400, 'Invalid or expired OTP')
    }

    // Validate referralCode if provided
    if (referralCode && referralCode.trim().length > 0) {
      const referrer = await prisma.user.findUnique({
        where: { inviteRefCode: referralCode.trim() },
        select: { id: true }
      })

      if (!referrer) {
        return errorResponse(res, 400, 'Invalid referral code')
      }
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { phone },
      include: {
        addresses: {
          where: { isDefault: true },
          take: 1
        }
      }
    })

    const isNewUser = !user

    if (!user) {
      // Prepare user data
      // inviteRefCode will be null by default and generated when name is set in updateProfile
      const userData = {
        phone,
        countryCode,
        role: 'CONSUMER',
        isActive: true,
        isVerified: true
      }

      // Set referralCode if provided during registration
      let referrer = null
      if (referralCode && referralCode.trim().length > 0) {
        userData.referralCode = referralCode.trim()
        referrer = await prisma.user.findUnique({
          where: { inviteRefCode: referralCode.trim() },
          select: { id: true, phone: true, name: true }
        })
      }

      // Create new user
      user = await prisma.user.create({
        data: userData,
        include: {
          addresses: true
        }
      })

      // Credit referrer wallet reward if applicable
      if (referrer) {
        try {
          let refCustomer = await prisma.customer.findUnique({
            where: {
              tenantId_mobile: {
                tenantId: 'VK001',
                mobile: referrer.phone
              }
            }
          })
          if (!refCustomer) {
            refCustomer = await prisma.customer.create({
              data: {
                mobile: referrer.phone,
                name: referrer.name || 'Consumer User',
                tenantId: 'VK001',
                creditBalance: 0.0
              }
            })
          }
          await prisma.$transaction([
            prisma.customer.update({
              where: { id: refCustomer.id },
              data: { creditBalance: { increment: 50.0 } }
            }),
            prisma.activityLog.create({
              data: {
                userId: referrer.id,
                action: 'WALLET_CREDIT',
                details: `Referral signup reward for inviting ${phone}`,
                metadata: { amount: 50.0, type: 'CREDIT' }
              }
            })
          ])
          logger.info('Referral wallet credit completed', { referrerId: referrer.id, refereeId: user.id })
        } catch (refErr) {
          logger.error('Error crediting referrer wallet', { referrerId: referrer.id, error: refErr.message })
        }
      }

      logger.info('New user created', {
        userId: user.id,
        phone,
        referralCode: user.referralCode
      })
    } else {
      // Update existing user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          isVerified: true,
          isActive: true,
          lastActive: new Date()
        },
        include: {
          addresses: true
        }
      })
    }

    // Generate tokens
    const accessToken = generateUserToken(user)
    const refreshToken = generateRefreshToken(user)

    // Create or update session
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 days for refresh token

    await prisma.session.create({
      data: {
        userId: user.id,
        token: refreshToken,
        deviceId: deviceId || null,
        fcmToken: fcmToken || null,
        expiresAt
      }
    })

    // Update device token if provided
    if (fcmToken) {
      await prisma.deviceToken.upsert({
        where: { deviceToken: fcmToken },
        update: {
          userId: user.id,
          updatedAt: new Date()
        },
        create: {
          userId: user.id,
          deviceToken: fcmToken
        }
      })
    }

    // Calculate profile completion
    const isProfileComplete = calculateProfileComplete(user)
    const missingFields = getMissingFields(user)

    // Prepare user response (exclude sensitive data)
    const userResponse = {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      referralCode: user.referralCode,
      inviteRefCode: user.inviteRefCode,
      dietaryPreference: user.dietaryPreference,
      deliveryPreference: user.deliveryPreference,
      isProfileComplete,
      missingFields,
      isNewUser
    }

    logger.info('User logged in successfully', {
      userId: user.id,
      phone,
      isNewUser
    })

    return successResponse(
      res,
      200,
      {
        user: userResponse,
        accessToken,
        refreshToken
      },
      isNewUser
        ? 'Account created and logged in successfully'
        : 'Logged in successfully'
    )
  } catch (error) {
    logger.error('Error verifying OTP', {
      error: error.message,
      stack: error.stack,
      phone: `${countryCode}${phone}`
    })

    return errorResponse(res, 500, 'Failed to verify OTP. Please try again.')
  }
})

/**
 * Get current user profile
 * GET /api/v1/user/me
 */
// export const getProfile = asyncHandler(async (req, res) => {
//   const userId = req.user.id

//   try {
//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//       include: {
//         addresses: {
//           orderBy: { isDefault: 'desc' }
//         }
//       }
//     })

//     if (!user) {
//       return errorResponse(res, 404, 'User not found')
//     }

//     const isProfileComplete = calculateProfileComplete(user)
//     const missingFields = getMissingFields(user)

//     const userResponse = {
//       id: user.id,
//       phone: user.phone,
//       name: user.name,
//       email: user.email,
//       role: user.role,
//       avatar: user.avatar,
//       gender: user.gender,
//       dob: user.dob,
//       countryCode: user.countryCode,
//       referralCode: user.referralCode,
//       inviteRefCode: user.inviteRefCode,
//       isProfileComplete,
//       missingFields,
//       addresses: user.addresses.map((addr) => ({
//         id: addr.id,
//         label: addr.label,
//         line1: addr.line1,
//         line2: addr.line2,
//         city: addr.city,
//         state: addr.state,
//         pincode: addr.pincode,
//         location: addr.location,
//         isDefault: addr.isDefault
//       })),
//       createdAt: user.createdAt,
//       updatedAt: user.updatedAt
//     }

//     return successResponse(
//       res,
//       200,
//       userResponse,
//       'Profile retrieved successfully'
//     )
//   } catch (error) {
//     logger.error('Error fetching profile', {
//       error: error.message,
//       userId
//     })

//     return errorResponse(res, 500, 'Failed to fetch profile')
//   }
// })

export const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id

  try {
    // Fetch user + addresses
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: {
          orderBy: { isDefault: 'desc' }
        }
      }
    })

    if (!user) {
      return errorResponse(res, 404, 'User not found')
    }

    // Count total orders
    let totalOrdersCount = 0
    try {
      totalOrdersCount = await prisma.order.count({
        where: { userId }
      })
    } catch (orderErr) {
      logger.warn('[getProfile] Failed to count orders', { error: orderErr.message })
    }

    // Count wishlist items (Active only)
    let totalWishlistCount = 0
    try {
      const wishlist = await prisma.wishlist.findUnique({
        where: { userId }
      })
      totalWishlistCount = (wishlist?.items || []).filter(item => item.status === 'ACTIVE').length
    } catch (wlErr) {
      logger.warn('[getProfile] Failed to count wishlist', { error: wlErr.message })
    }

    // Profile completeness
    const isProfileComplete = calculateProfileComplete(user)
    const missingFields = getMissingFields(user)

    const userResponse = {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      gender: user.gender,
      dob: user.dob,
      countryCode: user.countryCode,
      referralCode: user.referralCode,
      inviteRefCode: user.inviteRefCode,
      dietaryPreference: user.dietaryPreference,
      deliveryPreference: user.deliveryPreference,
      isProfileComplete,
      missingFields,

      // ---> ADDING THE NEW FIELDS
      totalOrdersCount,
      totalWishlistCount,

      addresses: user.addresses.map((addr) => ({
        id: addr.id,
        label: addr.label,
        line1: addr.line1,
        line2: addr.line2,
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode,
        location: addr.location,
        isDefault: addr.isDefault
      })),

      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }

    return successResponse(
      res,
      200,
      userResponse,
      'Profile retrieved successfully'
    )
  } catch (error) {
    logger.error('Error fetching profile', {
      error: error.message,
      userId
    })

    return errorResponse(res, 500, 'Failed to fetch profile')
  }
})

/**
 * Update user profile
 * PATCH /api/v1/user/update-profile
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { name, email, gender, dob, profileImage, avatar, address, referralCode, dietaryPreference, deliveryPreference } =
    req.body

  try {
    // Get current user to check if inviteRefCode needs to be updated
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, inviteRefCode: true, role: true }
    })

    if (!currentUser) {
      return errorResponse(res, 404, 'User not found')
    }

    // Build update data
    const updateData = {}

    if (name !== undefined) {
      updateData.name = name

      // Generate inviteRefCode if:
      // 1. User is a CONSUMER
      // 2. Name is being set/updated
      // 3. inviteRefCode is null (not generated yet)
      if (
        currentUser.role === 'CONSUMER' &&
        name &&
        name.trim().length > 0 &&
        !currentUser.inviteRefCode
      ) {
        updateData.inviteRefCode = await generateInviteRefCode(name)
      }
    }

    if (email !== undefined) updateData.email = email
    if (gender !== undefined) updateData.gender = gender
    if (dob !== undefined && dob !== null && dob !== '') updateData.dob = new Date(dob)
    
    const avatarUrl = profileImage !== undefined ? profileImage : avatar
    if (avatarUrl !== undefined) {
      if (typeof avatarUrl === 'string' && avatarUrl.includes('?')) {
        updateData.avatar = avatarUrl.split('?')[0]
      } else {
        updateData.avatar = avatarUrl
      }
    }

    if (dietaryPreference !== undefined) updateData.dietaryPreference = dietaryPreference
    if (deliveryPreference !== undefined) updateData.deliveryPreference = deliveryPreference

    // Handle File upload if avatar image is passed in req.files
    const uploadedFile = req.files
      ? (req.files.avatar || req.files.profileImage || req.files.image || req.files.file)
      : null

    if (uploadedFile) {
      try {
        const s3Uploads = await uploadFilesToS3(uploadedFile, 'avatars')
        if (s3Uploads && s3Uploads.length > 0) {
          updateData.avatar = s3Uploads[0].location || s3Uploads[0].url
        }
      } catch (uploadErr) {
        logger.error('S3 avatar upload failed, continuing update with other fields', { error: uploadErr.message })
      }
    }

    // Allow updating referralCode (the code that was used to invite this user)
    if (referralCode !== undefined) {
      // Validate that the referralCode exists if provided (optional validation)
      if (referralCode && referralCode.trim().length > 0) {
        const referrer = await prisma.user.findUnique({
          where: { inviteRefCode: referralCode.trim() },
          select: { id: true }
        })

        if (!referrer) {
          return errorResponse(res, 400, 'Invalid referral code')
        }
      }
      updateData.referralCode = referralCode ? referralCode.trim() : null
    }

    // Update user
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        addresses: true
      }
    })

    // Handle address update/creation
    if (address) {
      // If address has an ID, update it; otherwise create new
      if (address.id) {
        await prisma.address.update({
          where: { id: address.id },
          data: {
            label: address.label,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            location: address.location || null,
            isDefault:
              address.isDefault !== undefined ? address.isDefault : true
          }
        })
      } else {
        // If setting as default, unset other defaults
        if (address.isDefault !== false) {
          await prisma.address.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false }
          })
        }

        // Create new address
        await prisma.address.create({
          data: {
            userId,
            label: address.label || 'Home',
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            location: address.location || null,
            isDefault:
              address.isDefault !== undefined ? address.isDefault : true
          }
        })
      }
    }

    // Fetch updated user with addresses
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: {
          orderBy: { isDefault: 'desc' }
        }
      }
    })

    const isProfileComplete = calculateProfileComplete(updatedUser)
    const missingFields = getMissingFields(updatedUser)

    const userResponse = {
      id: updatedUser.id,
      phone: updatedUser.phone,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      avatar: updatedUser.avatar,
      gender: updatedUser.gender,
      dob: updatedUser.dob,
      referralCode: updatedUser.referralCode,
      inviteRefCode: updatedUser.inviteRefCode,
      dietaryPreference: updatedUser.dietaryPreference,
      deliveryPreference: updatedUser.deliveryPreference,
      isProfileComplete,
      missingFields
    }

    logger.info('Profile updated', {
      userId,
      fieldsUpdated: Object.keys(updateData)
    })

    return successResponse(
      res,
      200,
      { user: userResponse },
      'Profile updated successfully'
    )
  } catch (error) {
    logger.error('Error updating profile', {
      error: error.message,
      stack: error.stack,
      userId
    })

    // Handle unique constraint errors
    if (error.code === 'P2002') {
      if (error.meta?.target?.includes('email')) {
        return errorResponse(res, 400, 'Email already exists')
      }
    }

    return errorResponse(res, 500, 'Failed to update profile')
  }
})

/**
 * Update device token for push notifications
 * POST /api/v1/updateToken
 */
export const updateToken = asyncHandler(async (req, res) => {
  const {
    userId,
    deviceId,
    deviceToken,
    platform,
    deviceModel,
    deviceBrand,
    deviceManufacturer,
    deviceName,
    osName,
    osVersion,
    appVersion,
    buildNumber,
    sdkVersion,
    networkType,
    ipAddress,
    language,
    timezone,
    country,
    notificationEnabled,
    isEmulator,
    isRooted,
    updatedAt
  } = req.body

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    })

    if (!user) {
      return errorResponse(res, 404, 'User not found')
    }

    const tokenUpdatedAt = updatedAt ? new Date(updatedAt) : new Date()
    if (Number.isNaN(tokenUpdatedAt.getTime())) {
      return errorResponse(res, 400, 'updatedAt must be a valid ISO datetime')
    }

    await prisma.$transaction([
      prisma.deviceToken.upsert({
        where: { deviceToken },
        update: {
          userId,
          updatedAt: tokenUpdatedAt
        },
        create: {
          userId,
          deviceToken,
          createdAt: tokenUpdatedAt,
          updatedAt: tokenUpdatedAt
        }
      }),
      prisma.deviceMetadata.upsert({
        where: {
          userId_deviceId: {
            userId,
            deviceId
          }
        },
        update: {
          deviceToken,
          platform,
          deviceModel,
          deviceBrand,
          deviceManufacturer,
          deviceName,
          osName,
          osVersion,
          appVersion,
          buildNumber,
          sdkVersion,
          networkType,
          ipAddress,
          language,
          timezone,
          country,
          notificationEnabled,
          isEmulator,
          isRooted,
          clientUpdatedAt: tokenUpdatedAt
        },
        create: {
          userId,
          deviceId,
          deviceToken,
          platform,
          deviceModel,
          deviceBrand,
          deviceManufacturer,
          deviceName,
          osName,
          osVersion,
          appVersion,
          buildNumber,
          sdkVersion,
          networkType,
          ipAddress,
          language,
          timezone,
          country,
          notificationEnabled,
          isEmulator,
          isRooted,
          clientUpdatedAt: tokenUpdatedAt
        }
      })
    ])

    return res.status(200).json({
      success: true,
      message: 'Device token updated successfully.',
      data: {
        userId,
        deviceId,
        updatedAt: tokenUpdatedAt.toISOString()
      }
    })
  } catch (error) {
    logger.error('Error updating device token', {
      error: error.message,
      stack: error.stack,
      userId
    })

    return errorResponse(res, 500, 'Failed to update device token')
  }
})

/**
 * Login or register using Google/Apple details
 * POST /api/v1/user/social-login
 */
export const socialLogin = asyncHandler(async (req, res) => {
  const { email, name, phone, deviceId, fcmToken } = req.body

  if (!email) {
    return errorResponse(res, 400, 'Email is required for social authentication')
  }

  try {
    // 1. Look up user by email or phone
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(phone ? [{ phone }] : [])
        ]
      },
      include: {
        addresses: {
          where: { isDefault: true },
          take: 1
        }
      }
    })

    if (!user) {
      // If user doesn't exist, we must require phone number to satisfy unique DB constraint
      if (!phone) {
        return res.status(200).json({
          success: false,
          code: 'PHONE_REQUIRED',
          message: 'Phone number is required to register your social profile'
        })
      }

      // Create new user
      const userData = {
        phone,
        email,
        name: name || 'Social User',
        role: 'CONSUMER',
        isActive: true,
        isVerified: true
      }

      user = await prisma.user.create({
        data: userData,
        include: {
          addresses: true
        }
      })

      logger.info('New social user registered', { userId: user.id, email, phone })
    } else {
      // Update existing user with name/email if blank
      const updateData = {}
      if (!user.email) updateData.email = email
      if (!user.name && name) updateData.name = name

      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData,
          include: {
            addresses: true
          }
        })
      }
    }

    // Generate tokens
    const accessToken = generateUserToken(user)
    const refreshToken = generateRefreshToken(user)

    // Create session
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    await prisma.session.create({
      data: {
        userId: user.id,
        token: refreshToken,
        deviceId: deviceId || null,
        fcmToken: fcmToken || null,
        expiresAt
      }
    })

    return successResponse(res, 200, {
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        isVerified: user.isVerified,
        dietaryPreference: user.dietaryPreference,
        deliveryPreference: user.deliveryPreference,
        isProfileComplete: user.addresses && user.addresses.length > 0
      },
      token: {
        accessToken,
        refreshToken,
        expiresIn: 3600 // 1 hour
      }
    }, 'Authenticated via social account successfully')
  } catch (error) {
    logger.error('Error in socialLogin controller', { email, error: error.message })
    return errorResponse(res, 500, 'Social authentication failed')
  }
})

/**
 * Delete user account (Soft delete)
 * DELETE /api/v1/user/account
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user.id

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return errorResponse(res, 404, 'User not found')
    }

    const timestamp = Date.now()

    // Soft delete user and anonymize unique fields to allow re-registration
    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        name: 'Deleted User',
        phone: `deleted_${timestamp}_${user.phone}`.substring(0, 50),
        email: user.email ? `deleted_${timestamp}_${user.email}`.substring(0, 100) : null,
      }
    })

    // Delete active sessions and device tokens
    await prisma.session.deleteMany({
      where: { userId }
    })

    await prisma.deviceToken.deleteMany({
      where: { userId }
    })

    logger.info('User account deleted and anonymized', { userId })

    return successResponse(res, 200, null, 'Account deleted successfully')
  } catch (error) {
    logger.error('Error deleting account', {
      error: error.message,
      userId
    })
    return errorResponse(res, 500, 'Failed to delete account')
  }
})

/**
 * Refresh access token using a valid refresh token
 * POST /api/v1/auth/refresh-token or POST /api/v1/auth/refresh
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const tokenToRefresh = req.body?.refreshToken || req.body?.token || req.headers['x-refresh-token']

  if (!tokenToRefresh) {
    return errorResponse(res, 400, 'Refresh token is required')
  }

  try {
    const decoded = verifyToken(tokenToRefresh)

    if (decoded?.type !== 'refresh') {
      return errorResponse(res, 401, 'Invalid refresh token type')
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    })

    if (!user || !user.isActive) {
      return errorResponse(res, 401, 'User not found or inactive')
    }

    const newAccessToken = generateUserToken(user)
    const newRefreshToken = generateRefreshToken(user)

    const session = await prisma.session.findFirst({
      where: { token: tokenToRefresh, userId: user.id }
    })

    if (session) {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)
      await prisma.session.update({
        where: { id: session.id },
        data: {
          token: newRefreshToken,
          expiresAt
        }
      })
    }

    return successResponse(
      res,
      200,
      {
        token: newAccessToken,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: 86400
      },
      'Token refreshed successfully'
    )
  } catch (error) {
    logger.warn('Refresh token verification failed', { error: error.message })
    return errorResponse(res, 401, 'Invalid or expired refresh token')
  }
})
