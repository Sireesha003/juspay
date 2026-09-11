// controllers/categoriesController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { findNearestWarehouse } from '../utils/warehouseUtils.js'


const SERVICE_RADIUS_KM = 12

/**
 * Count active products for a category in a warehouse
 */
async function countProductsInCategory(categoryId, warehouseId) {
  try {
    const count = await prisma.product.count({
      where: {
        categoryId: categoryId,
        warehouseId: warehouseId,
        isActive: true
      }
    })
    return count
  } catch (error) {
    logger.error('[Categories] Error counting products', {
      error: error.message
    })
    return 0
  }
}

/**
 * Fetch categories for warehouse determined by pincode
 * POST /api/v1/categories
 * GET /api/v1/categories?pincode=...
 */
export const fetchCategories = asyncHandler(async (req, res) => {
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

  logger.info('[Categories] Fetching categories', {
    pincode,
    hasCoords: !!(latitude && longitude),
    hasUserId: !!userId
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

  logger.info('[Categories] Found warehouses by pincode', {
    count: warehousesByPincode.length
  })

  let selectedWarehouse = null
  let reason = ''

  // Step 2: Select warehouse
  if (warehousesByPincode.length === 0) {
    reason = 'Pincode not in any warehouse service area'
    logger.info('[Categories] No warehouse found for pincode', { pincode })

    return res.status(200).json({
      success: true,
      data: {
        serviceable: false,
        warehouse: null,
        categories: [],
        count: 0,
        reason
      },
      message: 'Pincode not serviceable'
    })
  } else if (warehousesByPincode.length === 1) {
    selectedWarehouse = warehousesByPincode[0]
    reason = 'Warehouse found for pincode'
    logger.info('[Categories] Single warehouse match', {
      warehouseId: selectedWarehouse.id
    })
  } else {
    // Multiple warehouses match - use coordinates if provided
    if (latitude !== undefined && longitude !== undefined) {
      logger.info('[Categories] Multiple warehouses match, selecting nearest')

      const nearest = findNearestWarehouse(
        warehousesByPincode,
        latitude,
        longitude
      )
      if (nearest) {
        selectedWarehouse = nearest.warehouse
        reason = `Multiple warehouses serve this pincode, nearest selected (${nearest.distance.toFixed(2)} km away)`
        logger.info('[Categories] Nearest warehouse selected', {
          warehouseId: selectedWarehouse.id,
          distance: nearest.distance.toFixed(2)
        })
      } else {
        selectedWarehouse = warehousesByPincode[0]
        reason = 'Multiple warehouses serve this pincode'
        logger.info(
          '[Categories] Distance calculation failed, using first warehouse'
        )
      }
    } else {
      selectedWarehouse = warehousesByPincode[0]
      reason = 'Multiple warehouses serve this pincode, first selected'
      logger.info(
        '[Categories] Multiple warehouses match, no coordinates provided, using first'
      )
    }
  }

  // Step 3: Fetch active categories enabled for the warehouse
  const warehouseCategories = await prisma.warehouseCategory.findMany({
    where: {
      warehouseId: selectedWarehouse.id,
      isEnabled: true,
      category: {
        isActive: true
      }
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          image: true,
          colorCode: true,
          displayOrder: true,
          categoryType: true,
        }
      }
    }
  })


  const allCategories = warehouseCategories.map(wc => wc.category)

  logger.info('[Categories] Found active categories', {
    count: allCategories.length
  })

  // Step 4: Count products per category and filter out categories with zero products
  const categoriesWithCounts = []

  for (const category of allCategories) {
    const itemCount = await countProductsInCategory(
      category.id,
      selectedWarehouse.id
    )

    if (itemCount > 0) {
      categoriesWithCounts.push({
        id: category.id,
        name: category.name || 'Unnamed Category',
        image: category.image,
        colorCode: category.colorCode || null,
        categoryType: category.categoryType || 'REGULAR',
        itemCount: itemCount,
        displayOrder: category.displayOrder || null
      })
    }
  }

  logger.info('[Categories] Categories with products', {
    count: categoriesWithCounts.length
  })

  const searchTerm = (req.body.search || req.query.search || req.body.query || req.query.query || req.query.q || '').trim()

  // Step 5: Filter categories by search term if provided
  let filteredCategories = categoriesWithCounts
  if (searchTerm) {
    filteredCategories = categoriesWithCounts.filter(cat => 
      cat.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }

  // Step 5.1: Fetch matching products if search term or query is provided
  let matchingProducts = []
  if (searchTerm) {
    const products = await prisma.product.findMany({
      where: {
        warehouseId: selectedWarehouse.id,
        isActive: true,
        status: 'APPROVED',
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { shortDescription: { contains: searchTerm, mode: 'insensitive' } },
          { tags: { hasSome: [searchTerm] } },
          { category: { name: { contains: searchTerm, mode: 'insensitive' } } }
        ]
      },
      take: 20,
      select: {
        id: true,
        name: true,
        price: true,
        finalPrice: true,
        mrp: true,
        images: true,
        unit: true,
        unitType: true,
        stock: true,
        category: {
          select: { id: true, name: true }
        }
      }
    })

    matchingProducts = products.map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      finalPrice: p.finalPrice || p.price,
      mrp: p.mrp || p.price,
      images: p.images || [],
      unit: p.unit,
      unitType: p.unitType,
      stock: p.stock || 0,
      categoryId: p.category?.id,
      categoryName: p.category?.name
    }))
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

  const successMessage = req.t ? req.t('CATEGORY_FETCHED') : 'Categories fetched successfully';

  // Step 7: Prepare final response returning BOTH categories and products
  const response = {
    success: true,
    data: {
      serviceable: true,
      warehouse: warehouseResponse,
      categories: filteredCategories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        image: cat.image,
        colorCode: cat.colorCode,
        categoryType: cat.categoryType || 'REGULAR',
        itemCount: cat.itemCount
      })),
      products: matchingProducts,
      count: filteredCategories.length,
      productsCount: matchingProducts.length,
      reason: reason
    },
    message: successMessage
  }

  logger.info('[Categories] Response prepared', {
    warehouseId: selectedWarehouse.id,
    categoriesCount: categoriesWithCounts.length
  })

  return res.status(200).json(response)
})
