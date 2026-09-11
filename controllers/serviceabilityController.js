// controllers/serviceabilityController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import {
  sortWarehousesByDistance,
  toNumberOrNull
} from '../utils/warehouseUtils.js'
import { evaluatePincodeWarehouseServiceability } from '../utils/warehouseServiceabilityUtils.js'
import { errorResponse } from '../utils/responseHelper.js'

// Configuration constant - adjust service radius here (in kilometers)
const SERVICE_RADIUS_KM = 30

/**
 * Format warehouse for API response: add image, imageUrl; merge latitude/longitude into location.
 * Latitude/longitude come from closestLocation or first WarehouseLocation when present.
 */
function formatWarehouseForResponse(warehouse, distance = null, closestLocation = null) {
  if (!warehouse) return null
  const loc =
    closestLocation ||
    (Array.isArray(warehouse.warehouseLocations) && warehouse.warehouseLocations[0]) ||
    null

  const lat = loc ? toNumberOrNull(loc.latitude) : null
  const lng = loc ? toNumberOrNull(loc.longitude) : null
  const { warehouseLocations, ...rest } = warehouse
  const location =
    typeof rest.location === 'object' && rest.location !== null
      ? { ...rest.location, latitude: lat, longitude: lng }
      : { latitude: lat, longitude: lng }

  const distNum = distance != null ? Math.round(distance * 10) / 10 : null

  return {
    ...rest,
    location,
    imageUrl: warehouse.imageUrl ?? null,
    distance: distNum,
    distanceKm: distNum,
    distanceText: distNum != null ? `${distNum.toFixed(1)} km away` : null,
    status: 'AVAILABLE_NOW'
  }
}

/**
 * Check serviceability for a pincode / GPS coordinates
 * POST /api/v1/serviceability
 * GET /api/v1/serviceability?pincode=...&latitude=...&longitude=...
 */
export const checkServiceability = asyncHandler(async (req, res) => {
  const body = req.body || {}
  const query = req.query || {}

  // Extract data from body (POST) or query (GET)
  const pincode = body.pincode || query.pincode

  const rawLat =
    body.latitude !== undefined
      ? body.latitude
      : query.latitude !== undefined
        ? query.latitude
        : body.lat !== undefined
          ? body.lat
          : query.lat

  const rawLng =
    body.longitude !== undefined
      ? body.longitude
      : query.longitude !== undefined
        ? query.longitude
        : body.lng !== undefined
          ? body.lng
          : query.lng

  const hasCoords =
    rawLat !== undefined &&
    rawLng !== undefined &&
    rawLat !== null &&
    rawLng !== null &&
    String(rawLat).trim() !== '' &&
    String(rawLng).trim() !== ''

  const latitude = hasCoords ? parseFloat(rawLat) : undefined
  const longitude = hasCoords ? parseFloat(rawLng) : undefined
  const hasValidCoords = latitude !== undefined && longitude !== undefined && !isNaN(latitude) && !isNaN(longitude)

  const userId = body.userId || query.userId

  logger.info('[Serviceability] Checking serviceability', {
    pincode,
    hasCoords: hasValidCoords,
    hasUserId: !!userId
  })

  /**
   * Fetch only warehouses whose PARTNER user is active.
   * If partner is inactive, that warehouse should not be shown.
   */
  const activePartnerWarehouseRows = await prisma.user.findMany({
    where: {
      role: 'PARTNER',
      isActive: true,
      warehouseId: {
        not: null
      }
    },
    select: {
      warehouseId: true
    },
    distinct: ['warehouseId']
  })

  const activePartnerWarehouseIds = activePartnerWarehouseRows
    .map((user) => user.warehouseId)
    .filter(Boolean)

  logger.info('[Serviceability] Active partner warehouses resolved', {
    count: activePartnerWarehouseIds.length
  })

  /**
   * If no active partners exist, no warehouse should be serviceable.
   */
  if (activePartnerWarehouseIds.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        serviceable: false,
        warehouse: null,
        distance: null,
        distanceKm: null,
        distanceText: null,
        reason: 'We are not serviceable at this location. Please select a different location.',
        availableWarehouses: []
      },
      message: 'We are not serviceable at this location. Please select a different location.'
    })
  }

  // Fetch all eligible active and approved partner warehouses with all locations
  const eligibleWarehouses = await prisma.warehouse.findMany({
    where: {
      id: {
        in: activePartnerWarehouseIds
      },
      isActive: true,
      approvalStatus: 'APPROVED'
    },
    select: {
      id: true,
      name: true,
      code: true,
      servicePincodes: true,
      location: true,
      address: true,
      phone: true,
      imageUrl: true,
      approvalStatus: true,
      warehouseLocations: {
        select: {
          latitude: true,
          longitude: true,
          doorNo: true,
          fullAddress: true,
          colonyOrVillage: true,
          city: true,
          state: true,
          pincode: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      }
    }
  })

  logger.info('[Serviceability] Eligible warehouses found', {
    count: eligibleWarehouses.length
  })

  let selectedWarehouse = null
  let selectedDistance = null
  let selectedLocation = null
  let isServiceable = false
  let reason = ''

  // RULE 1: If current GPS location is available
  if (hasValidCoords) {
    // 1. Calculate distance from CURRENT LOCATION to every active partner warehouse and sort closest -> farthest
    const sortedWarehouses = sortWarehousesByDistance(eligibleWarehouses, latitude, longitude)

    const nearestItem = sortedWarehouses[0]

    if (nearestItem) {
      const isWithinRadius = nearestItem.distance !== null && nearestItem.distance <= SERVICE_RADIUS_KM
      const isNearestPincodeServed = pincode && Array.isArray(nearestItem.warehouse.servicePincodes) && nearestItem.warehouse.servicePincodes.includes(pincode)

      let pincodeMatchItem = null
      if (pincode) {
        pincodeMatchItem = sortedWarehouses.find(
          (item) => Array.isArray(item.warehouse.servicePincodes) && item.warehouse.servicePincodes.includes(pincode)
        )
      }

      if (isWithinRadius || isNearestPincodeServed) {
        // Nearest store <= 30 KM -> Serviceable
        selectedWarehouse = nearestItem.warehouse
        selectedDistance = nearestItem.distance
        selectedLocation = nearestItem.closestLocation
        isServiceable = true
        reason = selectedDistance != null
          ? `Store is within delivery radius (${selectedDistance.toFixed(1)} km away)`
          : 'Store is within delivery radius'
      } else if (pincodeMatchItem) {
        // Nearest store > 30 KM but customer pincode is covered by an active store -> Serviceable
        selectedWarehouse = pincodeMatchItem.warehouse
        selectedDistance = pincodeMatchItem.distance
        selectedLocation = pincodeMatchItem.closestLocation
        isServiceable = true
        reason = selectedDistance != null
          ? `Pincode is in service area (${selectedDistance.toFixed(1)} km away)`
          : 'Pincode is in service area'
      } else {
        // Nearest store > 30 KM and customer pincode is NOT covered -> Not serviceable
        isServiceable = false
        selectedWarehouse = null
        selectedDistance = nearestItem.distance
        reason = selectedDistance != null
          ? `We are not serviceable at this location. Nearest store is ${selectedDistance.toFixed(1)} km away.`
          : 'We are not serviceable at this location. Please select a different location.'
      }
    }

    const distNum = selectedDistance != null ? Math.round(selectedDistance * 10) / 10 : null
    const nearestWarehouseFormatted = nearestItem
      ? formatWarehouseForResponse(nearestItem.warehouse, nearestItem.distance, nearestItem.closestLocation)
      : null

    const fallbackReason = isServiceable
      ? 'Serviceable'
      : (distNum != null
          ? `We are not serviceable at this location. Nearest store is ${distNum.toFixed(1)} km away.`
          : 'We are not serviceable at this location. Please select a different location.')

    const response = {
      success: true,
      data: {
        serviceable: isServiceable,
        warehouse: isServiceable ? formatWarehouseForResponse(selectedWarehouse, selectedDistance, selectedLocation) : null,
        nearestStore: nearestWarehouseFormatted,
        nearestWarehouse: nearestWarehouseFormatted,
        distance: distNum,
        distanceKm: distNum,
        distanceText: distNum != null ? `${distNum.toFixed(1)} km away` : null,
        nearestStoreDistance: distNum,
        nearestStoreDistanceKm: distNum,
        nearestStoreDistanceText: distNum != null ? `Nearest store is ${distNum.toFixed(1)} km away` : null,
        reason: reason || fallbackReason
      },
      message: isServiceable
        ? 'Serviceable'
        : (distNum != null
            ? `We are not serviceable at this location. Nearest store is ${distNum.toFixed(1)} km away.`
            : 'We are not serviceable at this location. Please select a different location.')
    }

    // When not serviceable, availableWarehouses ALWAYS shows all stores sorted distance-wise (e.g. 20 km 1st, 50 km 2nd)
    if (!isServiceable) {
      response.data.availableWarehouses = sortedWarehouses.map((item) =>
        formatWarehouseForResponse(item.warehouse, item.distance, item.closestLocation)
      )
    }

    logger.info('[Serviceability] Response prepared (coords)', {
      serviceable: response.data.serviceable,
      warehouseId: selectedWarehouse?.id || null,
      nearestStoreId: nearestItem?.warehouse?.id || null,
      distanceKm: selectedDistance,
      availableWarehousesCount: response.data.availableWarehouses?.length || 0
    })

    return res.status(200).json(response)
  }

  // RULE 2: If GPS is NOT available, evaluate by pincode alone (distances are null)
  if (pincode) {
    const warehousesByPincode = eligibleWarehouses.filter(
      (w) => Array.isArray(w.servicePincodes) && w.servicePincodes.includes(pincode)
    )

    if (warehousesByPincode.length > 0) {
      selectedWarehouse = warehousesByPincode[0]
      isServiceable = true
      reason = 'Pincode is in service area'
    } else {
      isServiceable = false
      reason = 'We are not serviceable at this location. Please select a different location.'
    }

    const nearestWarehouseFormatted = warehousesByPincode.length > 0
      ? formatWarehouseForResponse(warehousesByPincode[0], null)
      : (eligibleWarehouses.length > 0 ? formatWarehouseForResponse(eligibleWarehouses[0], null) : null)

    const response = {
      success: true,
      data: {
        serviceable: isServiceable,
        warehouse: isServiceable ? formatWarehouseForResponse(selectedWarehouse, null) : null,
        nearestStore: nearestWarehouseFormatted,
        nearestWarehouse: nearestWarehouseFormatted,
        distance: null,
        distanceKm: null,
        distanceText: null,
        nearestStoreDistance: null,
        nearestStoreDistanceKm: null,
        nearestStoreDistanceText: null,
        reason: reason || (isServiceable ? 'Serviceable' : 'We are not serviceable at this location. Please select a different location.')
      },
      message: isServiceable ? 'Serviceable' : 'We are not serviceable at this location. Please select a different location.'
    }

    if (!isServiceable) {
      response.data.availableWarehouses = eligibleWarehouses.map((w) =>
        formatWarehouseForResponse(w, null)
      )
    }

    logger.info('[Serviceability] Response prepared (pincode)', {
      serviceable: response.data.serviceable,
      warehouseId: selectedWarehouse?.id || null,
      availableWarehousesCount: response.data.availableWarehouses?.length || 0
    })

    return res.status(200).json(response)
  }

  // Neither coordinates nor pincode provided
  const fallbackNearestStore = eligibleWarehouses.length > 0
    ? formatWarehouseForResponse(eligibleWarehouses[0], null)
    : null

  return res.status(200).json({
    success: true,
    data: {
      serviceable: false,
      warehouse: null,
      nearestStore: fallbackNearestStore,
      nearestWarehouse: fallbackNearestStore,
      distance: null,
      distanceKm: null,
      distanceText: null,
      nearestStoreDistance: null,
      nearestStoreDistanceKm: null,
      nearestStoreDistanceText: null,
      reason: 'We are not serviceable at this location. Please select a different location.',
      availableWarehouses: eligibleWarehouses.map((w) => formatWarehouseForResponse(w, null))
    },
    message: 'We are not serviceable at this location. Please select a different location.'
  })
})

/**
 * Check whether a delivery pincode is serviceable by a specific warehouse (checkout validation).
 * POST /api/v1/check-serviceability
 *
 * Partner / zone alignment is enforced by requiring the pincode to appear in the warehouse’s
 * servicePincodes list (same rule as order creation).
 */
export const checkWarehousePincodeServiceability = asyncHandler(
  async (req, res) => {
    const { pincode, userId, warehouseId } = req.body || {}

    logger.info('[CheckServiceability] Request', {
      pincode,
      userId,
      warehouseId,
    })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (!user) {
      return errorResponse(res, 404, 'User not found')
    }

    const result = await evaluatePincodeWarehouseServiceability(
      warehouseId,
      pincode
    )

    return res.status(200).json({
      success: true,
      data: {
        serviceable: result.serviceable,
        reason: result.reason,
      },
      message: result.message,
    })
  }
)

/**
 * Handle notification requests for unserviceable locations
 * POST /api/v1/serviceability/notify
 */
export const notifyServiceability = asyncHandler(async (req, res) => {
  const { mobileNumber, pincode } = req.body || {}

  if (!mobileNumber || !pincode) {
    return errorResponse(res, 400, 'Mobile number and pincode are required')
  }

  // Check if pincode is already serviceable by an active warehouse
  const activePartnerWarehouseRows = await prisma.user.findMany({
    where: { role: 'PARTNER', isActive: true, warehouseId: { not: null } },
    select: { warehouseId: true },
    distinct: ['warehouseId']
  })

  const activePartnerWarehouseIds = activePartnerWarehouseRows
    .map((user) => user.warehouseId)
    .filter(Boolean)

  const serviceableWarehouses = await prisma.warehouse.findMany({
    where: {
      id: { in: activePartnerWarehouseIds },
      servicePincodes: { has: pincode },
      isActive: true,
      approvalStatus: 'APPROVED'
    }
  })

  if (serviceableWarehouses.length > 0) {
    return res.status(200).json({
      success: true,
      message: 'This pincode is already serviceable. You can start ordering now.'
    })
  }

  try {
    const existing = await prisma.locationWaitlist.findFirst({
      where: { mobileNumber, pincode }
    })

    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'You are already on the waitlist for this location.'
      })
    }

    await prisma.locationWaitlist.create({
      data: {
        mobileNumber,
        pincode
      }
    })

    return res.status(200).json({
      success: true,
      message: 'You will be notified once service becomes available.'
    })
  } catch (err) {
    throw err
  }
})
