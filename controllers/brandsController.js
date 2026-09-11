// controllers/brandsController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { findNearestWarehouse } from '../utils/warehouseUtils.js'


const SERVICE_RADIUS_KM = 12

/**
 * Select warehouse based on pincode and optional coordinates
 */
async function selectWarehouse(pincode, latitude, longitude) {
  const warehousesByPincode = await prisma.warehouse.findMany({
    where: {
      servicePincodes: {
        has: pincode
      },
      isActive: true
    },
    select: {
      id: true,
      name: true,
      code: true,
      servicePincodes: true,
      location: true
    }
  })

  if (warehousesByPincode.length === 0) {
    if (latitude !== undefined && longitude !== undefined) {
      const allActiveWarehouses = await prisma.warehouse.findMany({
        where: {
          isActive: true,
          location: {
            not: null
          }
        },
        select: {
          id: true,
          name: true,
          code: true,
          servicePincodes: true,
          location: true
        }
      })

      const nearest = findNearestWarehouse(allActiveWarehouses, latitude, longitude)

      if (nearest && nearest.distance <= SERVICE_RADIUS_KM) {
        return {
          warehouse: nearest.warehouse,
          reason: `Serviceable by nearest warehouse (${nearest.distance.toFixed(2)} km away)`
        }
      }
      return {
        warehouse: null,
        reason: `No warehouse found within ${SERVICE_RADIUS_KM} km radius`
      }
    }
    return {
      warehouse: null,
      reason: 'Pincode not in any warehouse service area and coordinates not provided'
    }
  }

  if (warehousesByPincode.length === 1) {
    return {
      warehouse: warehousesByPincode[0],
      reason: 'Warehouse found for pincode'
    }
  }

  // Multiple warehouses - use coordinates if provided
  if (latitude !== undefined && longitude !== undefined) {
    const nearest = findNearestWarehouse(warehousesByPincode, latitude, longitude)
    if (nearest) {
      return {
        warehouse: nearest.warehouse,
        reason: `Multiple warehouses serve this pincode, nearest selected (${nearest.distance.toFixed(2)} km away)`
      }
    }
  }

  // Fallback to first warehouse
  return {
    warehouse: warehousesByPincode[0],
    reason: 'Multiple warehouses serve this pincode, first selected'
  }
}

/**
 * Count active products for a brand in a warehouse
 */
async function countProductsInBrand(brandId, warehouseId) {
  try {
    const count = await prisma.product.count({
      where: {
        brandId: brandId,
        warehouseId: warehouseId,
        isActive: true
      }
    })
    return count
  } catch (error) {
    logger.error('[Brands] Error counting products', { error: error.message })
    return 0
  }
}

/**
 * Get top brands available in the warehouse
 * GET /api/v1/brands
 */
export const getTopBrands = asyncHandler(async (req, res) => {
  // Extract validated data from request
  const pincode = req.body.pincode || req.query.pincode
  const latitude = req.body.latitude !== undefined
    ? parseFloat(req.body.latitude)
    : req.query.latitude !== undefined
      ? parseFloat(req.query.latitude)
      : undefined
  const longitude = req.body.longitude !== undefined
    ? parseFloat(req.body.longitude)
    : req.query.longitude !== undefined
      ? parseFloat(req.query.longitude)
      : undefined
  const userId = req.body.userId || req.query.userId

  logger.info('[Brands] Fetching top brands', {
    pincode,
    hasCoords: !!(latitude && longitude),
    hasUserId: !!userId
  })

  // Select warehouse
  const { warehouse, reason } = await selectWarehouse(pincode, latitude, longitude)

  if (!warehouse) {
    return res.status(200).json({
      success: true,
      data: {
        serviceable: false,
        warehouse: null,
        brands: [],
        count: 0,
        reason
      },
      message: 'Pincode not serviceable'
    })
  }

  // Fetch active brands
  const allBrands = await prisma.brand.findMany({
    where: {
      isActive: true
    },
    select: {
      id: true,
      name: true,
      image: true,
      description: true,
      priority: true
    }
  })

  logger.info('[Brands] Found active brands', { count: allBrands.length })

  // Count products per brand and filter out brands with zero products
  const brandsWithCounts = []

  for (const brand of allBrands) {
    const productCount = await countProductsInBrand(brand.id, warehouse.id)

    if (productCount > 0) {
      brandsWithCounts.push({
        id: brand.id,
        name: brand.name,
        title: brand.name, // Alias for name
        image: brand.image,
        description: brand.description,
        productCount: productCount,
        priority: brand.priority || null
      })
    }
  }

  logger.info('[Brands] Brands with products', { count: brandsWithCounts.length })

  // Sort brands by product count descending, then by priority
  brandsWithCounts.sort((a, b) => {
    if (b.productCount !== a.productCount) {
      return b.productCount - a.productCount
    }
    // If product count is same, sort by priority (higher priority first)
    const priorityA = a.priority || 0
    const priorityB = b.priority || 0
    return priorityB - priorityA
  })

  // Translate dynamic content
  if (req.isTranslated) {

    // Align title and name after translation since title aliases name
    for (const brand of brandsWithCounts) {
      brand.title = brand.name;
    }
  }

  // Format warehouse response
  const warehouseResponse = {
    id: warehouse.id,
    name: warehouse.name
  }

  if (warehouse.code) {
    warehouseResponse.code = warehouse.code
  }

  if (warehouse.servicePincodes) {
    warehouseResponse.pincodeList = warehouse.servicePincodes
  }

  const successMessage = req.t ? req.t('BRAND_FETCHED') : 'Top brands fetched successfully';

  return res.status(200).json({
    success: true,
    data: {
      serviceable: true,
      warehouse: warehouseResponse,
      brands: brandsWithCounts.map((brand) => ({
        id: brand.id,
        name: brand.name,
        title: brand.title,
        image: brand.image,
        productCount: brand.productCount
      })),
      count: brandsWithCounts.length,
      reason: reason
    },
    message: successMessage
  })
})

