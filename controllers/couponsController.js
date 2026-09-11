// controllers/couponsController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { calculateCouponDiscount, normalizeCouponType } from '../utils/couponTypeUtils.js'

/**
 * Extract userId from request (from auth middleware or Authorization header)
 */
function extractUserIdFromAuth(req) {
  // First check if user is already authenticated via middleware
  if (req.user && req.user.id) {
    return req.user.id
  }

  // Fallback: Extract from Authorization header if needed
  // const authHeader = req.header('Authorization');
  // if (authHeader && authHeader.startsWith('Bearer ')) {
  //   const token = authHeader.split(' ')[1];
  //   // Decode JWT and extract userId
  //   // return decoded.userId;
  // }
  return null
}

/**
 * Check if user is new (created within last 30 days)
 */
async function isNewUser(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true }
    })

    if (!user) return false

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    return user.createdAt >= thirtyDaysAgo
  } catch (error) {
    logger.error('[Coupons] Error checking new user', { error: error.message })
    return false
  }
}

/**
 * Check if this is user's first order
 */
async function isFirstOrder(userId) {
  try {
    const orderCount = await prisma.order.count({
      where: {
        consumerId: userId,
        status: {
          not: 'CANCELLED'
        }
      }
    })

    return orderCount === 0
  } catch (error) {
    logger.error('[Coupons] Error checking first order', {
      error: error.message
    })
    return false
  }
}

/**
 * Get count of times user has used a specific coupon
 */
async function getUserCouponUsageCount(userId, couponId) {
  try {
    // Use CouponRedemption model to track usage
    const count = await prisma.couponRedemption.count({
      where: {
        userId: userId,
        couponId: couponId
      }
    })
    return count
  } catch (error) {
    logger.error('[Coupons] Error getting coupon usage count', {
      error: error.message
    })
    return 0
  }
}

/**
 * Get total remaining uses for a coupon
 */
function getTotalRemainingUses(coupon) {
  if (coupon.maxTotalUses !== null && coupon.maxTotalUses !== undefined) {
    const used = coupon.totalUses || 0
    return Math.max(0, coupon.maxTotalUses - used)
  }
  return null // Unlimited
}

import { calculateWarehouseMinDistance, toNumberOrNull } from '../utils/warehouseUtils.js'

/**
 * Check if coupon is applicable to user's pincode or warehouse
 */
function isPincodeApplicable(coupon, pincode, warehouseId = null) {
  if (!pincode && !warehouseId) return true // No filter means applicable

  // If coupon is associated with the selected/active warehouse
  if (warehouseId && coupon.warehouseId && coupon.warehouseId === warehouseId) {
    return true
  }

  // If coupon has no pincode restrictions (null, undefined, or empty array), it's applicable to all
  if (
    !coupon.applicablePincodes ||
    (Array.isArray(coupon.applicablePincodes) &&
      coupon.applicablePincodes.length === 0)
  ) {
    return true
  }

  // Check array of applicable pincodes
  if (pincode) {
    if (Array.isArray(coupon.applicablePincodes)) {
      if (coupon.applicablePincodes.includes(pincode)) return true
    } else if (typeof coupon.applicablePincodes === 'object') {
      const pincodes = Array.isArray(coupon.applicablePincodes)
        ? coupon.applicablePincodes
        : coupon.applicablePincodes.pincodes || []
      if (pincodes.length === 0 || pincodes.includes(pincode)) return true
    }
  }

  // If coupon is global scope, treat as applicable
  if (!coupon.warehouseId || coupon.scope === 'GLOBAL' || coupon.scope === 'global') {
    return true
  }

  return false
}

/**
 * Calculate discount amount for a given cart value
 */
function calculateDiscountForCart(coupon, cartValue) {
  const discount = calculateCouponDiscount(coupon, cartValue)
  return discount > 0 ? discount : null
}

/**
 * Format coupon object for response
 */
async function formatCouponForResponse(coupon, userId, cartValue) {
  const usageLeftForUser = userId
    ? await getUserCouponUsageCount(userId, coupon.id).then((count) => {
        const maxUses = coupon.maxUsesPerUser
        if (maxUses !== null && maxUses !== undefined) {
          return Math.max(0, maxUses - count)
        }
        return null // Unlimited
      })
    : null

  const calculatedDiscount = cartValue
    ? calculateDiscountForCart(coupon, cartValue)
    : null

  const minOrderVal = coupon.minOrderValue || 0
  const isApplicable = cartValue != null ? cartValue >= minOrderVal : true

  return {
    id: coupon.id,
    code: coupon.code,
    title: coupon.title,
    description: coupon.description,
    type: normalizeCouponType(coupon.type) || coupon.type,
    value: coupon.value,
    maxDiscount: coupon.maxDiscount || null,
    minOrderValue: minOrderVal,
    startDate: coupon.startDate,
    expiryDate: coupon.expiryDate,
    applicablePincodes: Array.isArray(coupon.applicablePincodes)
      ? coupon.applicablePincodes
      : null,
    warehouseId: coupon.warehouseId || null,
    usageLeftForUser: usageLeftForUser,
    totalRemainingUses: getTotalRemainingUses(coupon),
    calculatedDiscountForCart: calculatedDiscount,
    isApplicable: isApplicable,
    termsUrl: coupon.termsUrl || null
  }
}

/**
 * Common function to fetch and filter coupons
 */
async function fetchCouponsCommon({
  userId,
  pincode,
  warehouseId: rawWarehouseId,
  latitude,
  longitude,
  cartValue,
  filterByCartValue = false
}) {
  logger.info('[Coupons] Fetching coupons', {
    userId: userId || 'anonymous',
    pincode: pincode || 'none',
    warehouseId: rawWarehouseId || 'none',
    latitude: latitude || 'none',
    longitude: longitude || 'none',
    cartValue: cartValue || 'none',
    filterByCartValue
  })

  const now = new Date()

  // Build base query for active coupons within date range
  const baseWhere = {
    isActive: true,
    startDate: {
      lte: now
    },
    expiryDate: {
      gte: now
    }
  }

  let resolvedWarehouseId = rawWarehouseId || null

  // Resolve warehouse from pincode if not explicitly provided
  if (!resolvedWarehouseId && pincode) {
    const warehouse = await prisma.warehouse.findFirst({
      where: {
        servicePincodes: {
          has: pincode
        },
        isActive: true
      },
      select: {
        id: true
      }
    })
    if (warehouse) {
      resolvedWarehouseId = warehouse.id
      logger.info('[Coupons] Found warehouse for pincode', {
        pincode,
        warehouseId: resolvedWarehouseId
      })
    }
  }

  // Resolve warehouse from GPS if available and not yet resolved
  if (!resolvedWarehouseId && latitude != null && longitude != null) {
    const activeWarehouses = await prisma.warehouse.findMany({
      where: { isActive: true },
      include: { warehouseLocations: true }
    })
    let closestDist = Infinity
    for (const wh of activeWarehouses) {
      const distInfo = calculateWarehouseMinDistance(wh, latitude, longitude)
      if (distInfo && distInfo.distance < closestDist) {
        closestDist = distInfo.distance
        resolvedWarehouseId = wh.id
      }
    }
    if (resolvedWarehouseId) {
      logger.info('[Coupons] Found nearest warehouse for GPS', {
        warehouseId: resolvedWarehouseId,
        closestDist
      })
    }
  }

  // Fetch all active global coupons
  const globalCouponsQuery = {
    ...baseWhere,
    OR: [
      { scope: 'GLOBAL' },
      { scope: 'global' },
      { warehouseId: null }
    ]
  }

  let globalCoupons = await prisma.coupon.findMany({
    where: globalCouponsQuery,
    orderBy: {
      createdAt: 'desc'
    }
  })

  // Fetch warehouse-specific coupons if warehouse is determined
  let warehouseCoupons = []
  if (resolvedWarehouseId) {
    const warehouseCouponsQuery = {
      ...baseWhere,
      warehouseId: resolvedWarehouseId
    }

    warehouseCoupons = await prisma.coupon.findMany({
      where: warehouseCouponsQuery,
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  // If neither warehouse nor pincode, also fetch coupons associated with approved stores
  if (!resolvedWarehouseId && !pincode) {
    const allStoreCoupons = await prisma.coupon.findMany({
      where: baseWhere,
      orderBy: {
        createdAt: 'desc'
      }
    })
    warehouseCoupons = allStoreCoupons
  }

  // Fetch personalized coupons (assigned to user)
  let personalizedCoupons = []

  if (userId) {
    const userCouponAssignments = await prisma.userCoupon.findMany({
      where: {
        userId: userId,
        usedAt: null
      },
      include: {
        coupon: true
      }
    })

    personalizedCoupons = userCouponAssignments
      .map((assignment) => assignment.coupon)
      .filter((coupon) => {
        return (
          coupon.isActive && coupon.startDate <= now && coupon.expiryDate >= now
        )
      })
  }

  // Combine and deduplicate
  const allCoupons = [
    ...personalizedCoupons,
    ...globalCoupons,
    ...warehouseCoupons
  ]

  const uniqueCoupons = []
  const seenIds = new Set()
  for (const coupon of allCoupons) {
    if (!seenIds.has(coupon.id)) {
      seenIds.add(coupon.id)
      uniqueCoupons.push(coupon)
    }
  }

  // Filter by pincode / warehouse applicability
  const filteredByPincode = uniqueCoupons.filter((coupon) =>
    isPincodeApplicable(coupon, pincode, resolvedWarehouseId)
  )

  // Apply eligibility filters
  const eligibleCoupons = []

  for (const coupon of filteredByPincode) {
    let isEligible = true

    // Check new user only
    if (coupon.newUserOnly && userId) {
      const isNew = await isNewUser(userId)
      if (!isNew) {
        isEligible = false
        continue
      }
    }

    // Check first order only
    if (coupon.firstOrderOnly && userId) {
      const isFirst = await isFirstOrder(userId)
      if (!isFirst) {
        isEligible = false
        continue
      }
    }

    // Check minimum order value - only if filterByCartValue is requested and cartValue is provided
    if (filterByCartValue && cartValue !== undefined && cartValue > 0 && coupon.minOrderValue) {
      if (cartValue < coupon.minOrderValue) {
        isEligible = false
        continue
      }
    }

    // Check user usage limits
    if (
      userId &&
      coupon.maxUsesPerUser !== null &&
      coupon.maxUsesPerUser !== undefined
    ) {
      const usageCount = await getUserCouponUsageCount(userId, coupon.id)
      if (usageCount >= coupon.maxUsesPerUser) {
        isEligible = false
        continue
      }
    }

    // Check total usage limits
    if (coupon.maxTotalUses !== null && coupon.maxTotalUses !== undefined) {
      const used = coupon.totalUses || 0
      if (used >= coupon.maxTotalUses) {
        isEligible = false
        continue
      }
    }

    if (isEligible) {
      eligibleCoupons.push(coupon)
    }
  }

  // Format coupons for response
  const formattedPersonalized = []
  const formattedGlobal = []

  for (const coupon of eligibleCoupons) {
    const formatted = await formatCouponForResponse(coupon, userId, cartValue)

    const isPersonalized = personalizedCoupons.some((pc) => pc.id === coupon.id)

    if (isPersonalized) {
      formattedPersonalized.push(formatted)
    } else {
      formattedGlobal.push(formatted)
    }
  }

  return {
    personalized: formattedPersonalized,
    global: formattedGlobal,
    count: formattedPersonalized.length + formattedGlobal.length
  }
}

/**
 * Get Coupons for Home Page
 * GET /api/v1/coupons
 */
export const getCouponsForHome = asyncHandler(async (req, res) => {
  const query = req.query || {}
  let userId = query.userId
  let pincode = query.pincode
  let warehouseId = query.warehouseId || query.storeId
  let lat = query.lat || query.latitude ? parseFloat(query.lat || query.latitude) : null
  let lng = query.lng || query.longitude ? parseFloat(query.lng || query.longitude) : null

  if (!userId && req.user) {
    userId = req.user.id
  }
  if (!userId) {
    userId = extractUserIdFromAuth(req)
  }

  logger.info('[Coupons] Fetching coupons for home page', {
    userId: userId || 'anonymous',
    pincode: pincode || 'none',
    warehouseId: warehouseId || 'none'
  })

  const result = await fetchCouponsCommon({
    userId,
    pincode,
    warehouseId,
    latitude: lat,
    longitude: lng,
    cartValue: query.cartValue ? parseFloat(query.cartValue) : undefined,
    filterByCartValue: false
  })

  const response = {
    success: true,
    data: result,
    message: 'Coupons fetched successfully for home page'
  }

  return res.status(200).json(response)
})

/**
 * Get Coupons for Cart Page
 * GET /api/v1/coupons/cart
 */
export const getCouponsForCart = asyncHandler(async (req, res) => {
  const query = req.query || {}
  let userId = query.userId
  let pincode = query.pincode
  let warehouseId = query.warehouseId || query.storeId
  let lat = query.lat || query.latitude ? parseFloat(query.lat || query.latitude) : null
  let lng = query.lng || query.longitude ? parseFloat(query.lng || query.longitude) : null
  let cartValue = query.cartValue !== undefined && query.cartValue !== '' ? parseFloat(query.cartValue) : undefined

  if (!userId && req.user) {
    userId = req.user.id
  }
  if (!userId) {
    userId = extractUserIdFromAuth(req)
  }

  logger.info('[Coupons] Fetching coupons for cart page', {
    userId: userId || 'anonymous',
    pincode: pincode || 'none',
    warehouseId: warehouseId || 'none',
    cartValue: cartValue || 'none'
  })

  const result = await fetchCouponsCommon({
    userId,
    pincode,
    warehouseId,
    latitude: lat,
    longitude: lng,
    cartValue: !isNaN(cartValue) ? cartValue : undefined,
    filterByCartValue: false // Show all available promo codes so the user can see them and know what they can apply
  })

  const response = {
    success: true,
    data: result,
    message: 'Coupons fetched successfully for cart page'
  }

  return res.status(200).json(response)
})

/**
 * Legacy endpoint - Get Coupons (for backward compatibility)
 * GET /api/v1/coupons
 * This endpoint now redirects to home page coupons
 */
export const getCoupons = getCouponsForHome
