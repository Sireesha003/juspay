// controllers/subcategoriesController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { findNearestWarehouse } from '../utils/warehouseUtils.js'


const SERVICE_RADIUS_KM = 12

/**
 * Count active products for a sub-category in a warehouse
 */
async function countProductsInSubCategory(subCategoryId, warehouseId) {
  try {
    const count = await prisma.product.count({
      where: {
        subCategoryId: subCategoryId,
        warehouseId: warehouseId,
        isActive: true
      }
    })
    return count
  } catch (error) {
    logger.error('[SubCategories] Error counting products', {
      error: error.message
    })
    return 0
  }
}

/**
 * Fetch sub-categories for warehouse determined by pincode and category
 * POST /api/v1/subcategories
 * GET /api/v1/subcategories?pincode=...&categoryId=...
 */
export const fetchSubCategories = asyncHandler(async (req, res) => {
  // Extract validated data from request
  const pincode = req.body.pincode || req.query.pincode
  const latitude =
    req.body.latitude !== undefined
      ? parseFloat(req.body.latitude)
      : req.query.latitude !== undefined
        ? parseFloat(req.query.latitude)
        : undefined
  const longitude =
    req.body.longitude !== undefined
      ? parseFloat(req.body.longitude)
      : req.query.longitude !== undefined
        ? parseFloat(req.query.longitude)
        : undefined
  const userId = req.body.userId || req.query.userId
  const categoryId = req.body.categoryId || req.query.categoryId

  logger.info('[SubCategories] Fetching sub-categories', {
    pincode,
    hasCoords: !!(latitude && longitude),
    hasUserId: !!userId,
    categoryId
  })

  // Step 1: Find warehouses that serve this pincode
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

  logger.info('[SubCategories] Found warehouses by pincode', {
    count: warehousesByPincode.length
  })

  let selectedWarehouse = null
  let reason = ''

  // Step 2: Select warehouse
  if (warehousesByPincode.length === 0) {
    // No pincode match - check if we can use coordinates
    if (latitude !== undefined && longitude !== undefined) {
      logger.info('[SubCategories] No pincode match, checking by distance')

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

      logger.info('[SubCategories] Found active warehouses with location', {
        count: allActiveWarehouses.length
      })

      const nearest = findNearestWarehouse(
        allActiveWarehouses,
        latitude,
        longitude
      )

      if (nearest && nearest.distance <= SERVICE_RADIUS_KM) {
        selectedWarehouse = nearest.warehouse
        reason = `Serviceable by nearest warehouse (${nearest.distance.toFixed(2)} km away)`
        logger.info('[SubCategories] Nearest warehouse within radius', {
          warehouseId: selectedWarehouse.id,
          distance: nearest.distance.toFixed(2)
        })
      } else {
        reason = `No warehouse found within ${SERVICE_RADIUS_KM} km radius`
        logger.info('[SubCategories] No warehouse within service radius')

        return res.status(200).json({
          success: true,
          data: {
            serviceable: false,
            warehouse: null,
            subcategories: [],
            count: 0,
            reason
          },
          message: 'Pincode not serviceable'
        })
      }
    } else {
      reason =
        'Pincode not in any warehouse service area and coordinates not provided'
      logger.info(
        '[SubCategories] Not serviceable - no pincode match and no coordinates'
      )

      return res.status(200).json({
        success: true,
        data: {
          serviceable: false,
          warehouse: null,
          subcategories: [],
          count: 0,
          reason
        },
        message: 'Pincode not serviceable'
      })
    }
  } else if (warehousesByPincode.length === 1) {
    selectedWarehouse = warehousesByPincode[0]
    reason = 'Warehouse found for pincode'
    logger.info('[SubCategories] Single warehouse match', {
      warehouseId: selectedWarehouse.id
    })
  } else {
    // Multiple warehouses match - use coordinates if provided
    if (latitude !== undefined && longitude !== undefined) {
      logger.info(
        '[SubCategories] Multiple warehouses match, selecting nearest'
      )

      const nearest = findNearestWarehouse(
        warehousesByPincode,
        latitude,
        longitude
      )
      if (nearest) {
        selectedWarehouse = nearest.warehouse
        reason = `Multiple warehouses serve this pincode, nearest selected (${nearest.distance.toFixed(2)} km away)`
        logger.info('[SubCategories] Nearest warehouse selected', {
          warehouseId: selectedWarehouse.id,
          distance: nearest.distance.toFixed(2)
        })
      } else {
        selectedWarehouse = warehousesByPincode[0]
        reason = 'Multiple warehouses serve this pincode'
        logger.info(
          '[SubCategories] Distance calculation failed, using first warehouse'
        )
      }
    } else {
      selectedWarehouse = warehousesByPincode[0]
      reason = 'Multiple warehouses serve this pincode, first selected'
      logger.info(
        '[SubCategories] Multiple warehouses match, no coordinates provided, using first'
      )
    }
  }

  // Step 3: Fetch active sub-categories enabled for the warehouse and category
  const warehouseSubCategories = await prisma.warehouseSubCategory.findMany({
    where: {
      warehouseId: selectedWarehouse.id,
      warehouseCategory: {
        categoryId: categoryId,
        isEnabled: true
      },
      subCategory: {
        isActive: true
      }
    },
    include: {
      subCategory: {
        select: {
          id: true,
          name: true,
          image: true,
          colorCode: true,
          displayOrder: true,
          categoryId: true
        }
      }
    }
  })

  const allSubCategories = warehouseSubCategories.map(wsc => wsc.subCategory)

  logger.info('[SubCategories] Found active sub-categories', {
    count: allSubCategories.length
  })

  // Step 4: Count products per sub-category and filter out sub-categories with zero products
  const subCategoriesWithCounts = []

  for (const subCategory of allSubCategories) {
    const itemCount = await countProductsInSubCategory(
      subCategory.id,
      selectedWarehouse.id
    )

    if (itemCount > 0) {
      subCategoriesWithCounts.push({
        id: subCategory.id,
        name: subCategory.name || 'Unnamed SubCategory',
        image: subCategory.image,
        colorCode: subCategory.colorCode || null,
        itemCount: itemCount,
        displayOrder: subCategory.displayOrder || null,
        categoryId: subCategory.categoryId
      })
    }
  }

  logger.info('[SubCategories] Sub-categories with products', {
    count: subCategoriesWithCounts.length
  })

  // Step 5: Sort sub-categories by itemCount descending
  subCategoriesWithCounts.sort((a, b) => b.itemCount - a.itemCount)

  // Step 5.5: Translate dynamic content
  if (req.isTranslated) {

  }

  // Step 6: Format warehouse response
  const warehouseResponse = {
    id: selectedWarehouse.id,
    name: selectedWarehouse.name
  }

  if (selectedWarehouse.code) {
    warehouseResponse.code = selectedWarehouse.code
  }

  if (selectedWarehouse.servicePincodes) {
    warehouseResponse.pincodeList = selectedWarehouse.servicePincodes
  }

  const successMessage = req.t ? req.t('SUB_CATEGORY_FETCHED') : 'Sub-categories fetched successfully';

  // Step 7: Prepare final response
  const response = {
    success: true,
    data: {
      serviceable: true,
      warehouse: warehouseResponse,
      subcategories: subCategoriesWithCounts.map((subCat) => ({
        id: subCat.id,
        name: subCat.name,
        image: subCat.image,
        colorCode: subCat.colorCode,
        itemCount: subCat.itemCount
      })),
      count: subCategoriesWithCounts.length,
      reason: reason
    },
    message: successMessage
  }

  logger.info('[SubCategories] Response prepared', {
    warehouseId: selectedWarehouse.id,
    subCategoriesCount: subCategoriesWithCounts.length
  })

  return res.status(200).json(response)
})
