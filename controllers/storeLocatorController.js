import { prisma } from '../config/prismaClient.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import {
  sortWarehousesByDistance,
  calculateWarehouseMinDistance,
  toNumberOrNull
} from '../utils/warehouseUtils.js'

// Configuration constant - adjust service radius here (in kilometers)
const SERVICE_RADIUS_KM = 30

/**
 * Helper to format store object for API response
 */
function formatStoreItem(store, distance = null, closestLocation = null) {
  const distNum = distance != null ? Math.round(distance * 10) / 10 : null
  const loc =
    closestLocation ||
    (Array.isArray(store.warehouseLocations) && store.warehouseLocations[0]) ||
    null

  const lat = loc ? toNumberOrNull(loc.latitude) : null
  const lng = loc ? toNumberOrNull(loc.longitude) : null

  const locationObj =
    typeof store.location === 'object' && store.location !== null
      ? { ...store.location, latitude: lat, longitude: lng }
      : { latitude: lat, longitude: lng }

  return {
    id: store.id,
    name: store.name,
    code: store.code,
    address: store.address || (loc?.fullAddress ?? ''),
    city: store.city || (loc?.city ?? ''),
    state: store.state || (loc?.state ?? ''),
    pincode: store.pincode || (loc?.pincode ?? ''),
    phone: store.phone ?? null,
    imageUrl: store.imageUrl ?? null,
    servicePincodes: store.servicePincodes || [],
    location: locationObj,
    distance: distNum,
    distanceKm: distNum,
    distanceText: distNum != null ? `${distNum.toFixed(1)} km away` : null,
    isServiceable: distNum != null ? distNum <= SERVICE_RADIUS_KM : true,
    status: 'AVAILABLE_NOW'
  }
}

/**
 * Get nearest store / warehouse and distance from current location
 * GET /api/v1/store-locator/nearest
 * POST /api/v1/store-locator/nearest
 * GET /api/v1/serviceability/nearest-store
 * POST /api/v1/serviceability/nearest-store
 */
export const getNearestStore = asyncHandler(async (req, res) => {
  const body = req.body || {}
  const query = req.query || {}

  const rawLat = body.latitude ?? query.latitude ?? body.lat ?? query.lat
  const rawLng = body.longitude ?? query.longitude ?? body.lng ?? query.lng
  const pincode = body.pincode || query.pincode

  const hasCoords =
    rawLat !== undefined &&
    rawLng !== undefined &&
    rawLat !== null &&
    rawLng !== null &&
    String(rawLat).trim() !== '' &&
    String(rawLng).trim() !== ''

  const userLat = hasCoords ? parseFloat(rawLat) : null
  const userLng = hasCoords ? parseFloat(rawLng) : null

  if (hasCoords && (isNaN(userLat) || isNaN(userLng))) {
    return errorResponse(res, 400, 'Latitude and Longitude must be valid numbers')
  }

  try {
    // 1. Fetch active partner warehouse IDs
    const activePartnerWarehouseRows = await prisma.user.findMany({
      where: {
        role: 'PARTNER',
        isActive: true,
        warehouseId: { not: null }
      },
      select: { warehouseId: true },
      distinct: ['warehouseId']
    })

    const activePartnerWarehouseIds = activePartnerWarehouseRows
      .map((user) => user.warehouseId)
      .filter(Boolean)

    if (activePartnerWarehouseIds.length === 0) {
      return successResponse(res, 200, {
        isServiceable: false,
        distance: null,
        distanceKm: null,
        distanceText: null,
        nearestStoreDistanceText: null,
        store: null,
        nearestStore: null,
        nearestWarehouse: null
      }, 'No active stores available')
    }

    // 2. Fetch warehouses that are active, approved, and belong to active partners
    const stores = await prisma.warehouse.findMany({
      where: {
        id: { in: activePartnerWarehouseIds },
        isActive: true,
        approvalStatus: 'APPROVED'
      },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        phone: true,
        imageUrl: true,
        servicePincodes: true,
        location: true,
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

    if (stores.length === 0) {
      return successResponse(res, 200, {
        isServiceable: false,
        distance: null,
        distanceKm: null,
        distanceText: null,
        nearestStoreDistanceText: null,
        store: null,
        nearestStore: null,
        nearestWarehouse: null
      }, 'No active stores available')
    }

    // 3. Sort stores by distance
    const sorted = sortWarehousesByDistance(stores, userLat, userLng)
    const nearestItem = sorted[0]

    if (!nearestItem) {
      return successResponse(res, 200, {
        isServiceable: false,
        distance: null,
        distanceKm: null,
        distanceText: null,
        nearestStoreDistanceText: null,
        store: null,
        nearestStore: null,
        nearestWarehouse: null
      }, 'No stores found')
    }

    const distNum = nearestItem.distance != null ? Math.round(nearestItem.distance * 10) / 10 : null
    const formattedStore = formatStoreItem(nearestItem.warehouse, nearestItem.distance, nearestItem.closestLocation)
    const isServiceable = distNum != null
      ? distNum <= SERVICE_RADIUS_KM
      : (pincode && Array.isArray(nearestItem.warehouse.servicePincodes) ? nearestItem.warehouse.servicePincodes.includes(pincode) : false)

    const distanceText = distNum != null ? `${distNum.toFixed(1)} km away` : null
    const nearestStoreDistanceText = distNum != null ? `Nearest store is ${distNum.toFixed(1)} km away` : null

    const data = {
      isServiceable,
      distance: distNum,
      distanceKm: distNum,
      distanceText,
      nearestStoreDistanceText,
      store: formattedStore,
      nearestStore: formattedStore,
      nearestWarehouse: formattedStore
    }

    const message = isServiceable
      ? (distNum != null ? `Store is within delivery radius (${distNum.toFixed(1)} km away)` : 'Store is serviceable')
      : (distNum != null ? `Nearest store is ${distNum.toFixed(1)} km away` : 'We are not serviceable at this location.')

    logger.info('[StoreLocator] Nearest store retrieved', {
      storeId: formattedStore.id,
      distanceKm: distNum,
      isServiceable
    })

    return successResponse(res, 200, data, message)
  } catch (error) {
    logger.error('[StoreLocator] Error fetching nearest store', { error: error.message })
    return errorResponse(res, 500, 'Failed to fetch nearest store')
  }
})

/**
 * Find nearby stores/warehouses sorted by distance (closest first based on kms)
 * GET /api/v1/store-locator/nearby
 */
export const getNearbyStores = asyncHandler(async (req, res) => {
  const query = req.query || {}
  const rawLat = query.lat || query.latitude
  const rawLng = query.lng || query.longitude

  const hasCoords =
    rawLat !== undefined &&
    rawLng !== undefined &&
    rawLat !== null &&
    rawLng !== null &&
    String(rawLat).trim() !== '' &&
    String(rawLng).trim() !== ''

  const userLat = hasCoords ? parseFloat(rawLat) : null
  const userLng = hasCoords ? parseFloat(rawLng) : null

  if (hasCoords && (isNaN(userLat) || isNaN(userLng))) {
    return errorResponse(res, 400, 'Latitude and Longitude must be valid numbers')
  }

  try {
    // 1. Fetch active partner warehouse IDs
    const activePartnerWarehouseRows = await prisma.user.findMany({
      where: {
        role: 'PARTNER',
        isActive: true,
        warehouseId: { not: null }
      },
      select: { warehouseId: true },
      distinct: ['warehouseId']
    })

    const activePartnerWarehouseIds = activePartnerWarehouseRows
      .map((user) => user.warehouseId)
      .filter(Boolean)

    if (activePartnerWarehouseIds.length === 0) {
      return successResponse(res, 200, [], 'No active stores available')
    }

    // 2. Fetch warehouses that are active, approved, and belong to active partners
    const stores = await prisma.warehouse.findMany({
      where: {
        id: { in: activePartnerWarehouseIds },
        isActive: true,
        approvalStatus: 'APPROVED'
      },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        phone: true,
        imageUrl: true,
        servicePincodes: true,
        location: true,
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

    // 3. Sort stores by distance (closest first based on kms)
    const sorted = sortWarehousesByDistance(stores, userLat, userLng)

    const result = sorted.map((item) =>
      formatStoreItem(item.warehouse, item.distance, item.closestLocation)
    )

    logger.info('[StoreLocator] Nearby stores retrieved', { count: result.length, hasCoords })

    return successResponse(res, 200, result, 'Stores retrieved successfully')
  } catch (error) {
    logger.error('[StoreLocator] Error fetching stores', { error: error.message })
    return errorResponse(res, 500, 'Failed to fetch stores')
  }
})

/**
 * Search stores by query (name, code, address, city, pincode) + optional GPS distance calculation
 * GET /api/v1/store-locator/search
 * GET /api/v1/store-locator?q=...
 */
export const searchStores = asyncHandler(async (req, res) => {
  const query = req.query || {}
  const searchText = (query.q || query.query || query.search || '').trim()
  const rawLat = query.lat || query.latitude
  const rawLng = query.lng || query.longitude
  const filterPincode = query.pincode ? String(query.pincode).trim() : null
  const filterCity = query.city ? String(query.city).trim() : null

  const hasCoords =
    rawLat !== undefined &&
    rawLng !== undefined &&
    rawLat !== null &&
    rawLng !== null &&
    String(rawLat).trim() !== '' &&
    String(rawLng).trim() !== ''

  const userLat = hasCoords ? parseFloat(rawLat) : null
  const userLng = hasCoords ? parseFloat(rawLng) : null

  if (hasCoords && (isNaN(userLat) || isNaN(userLng))) {
    return errorResponse(res, 400, 'Latitude and Longitude must be valid numbers')
  }

  try {
    // 1. Fetch active partner warehouse IDs
    const activePartnerWarehouseRows = await prisma.user.findMany({
      where: {
        role: 'PARTNER',
        isActive: true,
        warehouseId: { not: null }
      },
      select: { warehouseId: true },
      distinct: ['warehouseId']
    })

    const activePartnerWarehouseIds = activePartnerWarehouseRows
      .map((user) => user.warehouseId)
      .filter(Boolean)

    if (activePartnerWarehouseIds.length === 0) {
      return successResponse(res, 200, [], 'No active stores available')
    }

    // 2. Build where filter
    const whereConditions = {
      id: { in: activePartnerWarehouseIds },
      isActive: true,
      approvalStatus: 'APPROVED'
    }

    if (filterPincode) {
      whereConditions.OR = [
        { pincode: { contains: filterPincode, mode: 'insensitive' } },
        { servicePincodes: { has: filterPincode } }
      ]
    }

    if (filterCity) {
      whereConditions.city = { contains: filterCity, mode: 'insensitive' }
    }

    if (searchText) {
      whereConditions.OR = [
        { name: { contains: searchText, mode: 'insensitive' } },
        { code: { contains: searchText, mode: 'insensitive' } },
        { address: { contains: searchText, mode: 'insensitive' } },
        { city: { contains: searchText, mode: 'insensitive' } },
        { state: { contains: searchText, mode: 'insensitive' } },
        { pincode: { contains: searchText, mode: 'insensitive' } },
        { servicePincodes: { has: searchText } },
        {
          warehouseLocations: {
            some: {
              OR: [
                { fullAddress: { contains: searchText, mode: 'insensitive' } },
                { city: { contains: searchText, mode: 'insensitive' } },
                { state: { contains: searchText, mode: 'insensitive' } },
                { pincode: { contains: searchText, mode: 'insensitive' } },
                { colonyOrVillage: { contains: searchText, mode: 'insensitive' } },
                { mandalOrTaluk: { contains: searchText, mode: 'insensitive' } },
                { district: { contains: searchText, mode: 'insensitive' } },
                { landmark: { contains: searchText, mode: 'insensitive' } },
                { roadOrStreet: { contains: searchText, mode: 'insensitive' } }
              ]
            }
          }
        }
      ]
    }

    const stores = await prisma.warehouse.findMany({
      where: whereConditions,
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        phone: true,
        imageUrl: true,
        servicePincodes: true,
        location: true,
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

    // 3. Sort stores by distance if GPS is available
    const sorted = sortWarehousesByDistance(stores, userLat, userLng)

    const result = sorted.map((item) =>
      formatStoreItem(item.warehouse, item.distance, item.closestLocation)
    )

    logger.info('[StoreLocator] Store search executed', {
      query: searchText,
      count: result.length,
      hasCoords
    })

    return successResponse(
      res,
      200,
      result,
      result.length > 0 ? 'Stores found' : 'No stores matching your search'
    )
  } catch (error) {
    logger.error('[StoreLocator] Error searching stores', { error: error.message })
    return errorResponse(res, 500, 'Failed to search stores')
  }
})

/**
 * Get store details by ID
 * GET /api/v1/store-locator/:id
 */
export const getStoreDetails = asyncHandler(async (req, res) => {
  const { id } = req.params
  const query = req.query || {}
  const rawLat = query.lat || query.latitude
  const rawLng = query.lng || query.longitude

  const hasCoords =
    rawLat !== undefined &&
    rawLng !== undefined &&
    rawLat !== null &&
    rawLng !== null &&
    String(rawLat).trim() !== '' &&
    String(rawLng).trim() !== ''

  const userLat = hasCoords ? parseFloat(rawLat) : null
  const userLng = hasCoords ? parseFloat(rawLng) : null

  try {
    const store = await prisma.warehouse.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        phone: true,
        imageUrl: true,
        servicePincodes: true,
        location: true,
        isActive: true,
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

    if (!store || !store.isActive || store.approvalStatus !== 'APPROVED') {
      return errorResponse(res, 404, 'Store not found or currently unavailable')
    }

    let distance = null
    let closestLocation = null

    if (hasCoords) {
      const distInfo = calculateWarehouseMinDistance(store, userLat, userLng)
      if (distInfo) {
        distance = distInfo.distance
        closestLocation = distInfo.closestLocation
      }
    }

    const formatted = formatStoreItem(store, distance, closestLocation)

    return successResponse(res, 200, formatted, 'Store details retrieved successfully')
  } catch (error) {
    logger.error('[StoreLocator] Error fetching store details', { error: error.message })
    return errorResponse(res, 500, 'Failed to fetch store details')
  }
})
