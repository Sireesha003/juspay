// controllers/popularProductsController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { findNearestWarehouse } from '../utils/warehouseUtils.js'
import { isValidUUID } from '../utils/uuidValidator.js'
import { mapVariants, variantsInclude } from '../utils/variantHelper.js'
import { PriceResolverService } from '../services/priceResolverService.js'


const SERVICE_RADIUS_KM = 12
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

async function resolveProductPrices(products, channel = 'ONLINE') {
  if (!products) return products;
  const isArray = Array.isArray(products);
  const list = isArray ? products : [products];
  
  for (const product of list) {
    const wId = product.warehouseId;
    const cleanChannel = (channel || 'ONLINE').toUpperCase();
    const targetChannel = wId && ['ONLINE', 'VEHICLE', 'POS'].includes(cleanChannel)
      ? `${cleanChannel}_${wId}`
      : channel;

    const resolvedProduct = await PriceResolverService.resolvePrice({
      productId: product.id,
      channel: targetChannel
    });
    product.price = resolvedProduct.sellingPrice;
    product.mrp = resolvedProduct.mrp;
    product.finalPrice = resolvedProduct.sellingPrice;

    if (Array.isArray(product.variants)) {
      for (const variant of product.variants) {
        const resolvedVariant = await PriceResolverService.resolvePrice({
          productId: product.id,
          productVariantId: variant.id,
          channel: targetChannel
        });
        variant.sellingPrice = resolvedVariant.sellingPrice;
        variant.mrp = resolvedVariant.mrp;
        variant.price = resolvedVariant.sellingPrice;
      }
    }
  }
  
  return isArray ? list : list[0];
}

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

      const nearest = findNearestWarehouse(
        allActiveWarehouses,
        latitude,
        longitude
      )

      if (nearest && nearest.distance <= SERVICE_RADIUS_KM) {
        return {
          warehouse: nearest.warehouse,
          reason: `Serviceable by nearest warehouse (${nearest.distance.toFixed(
            2
          )} km away)`
        }
      }

      return {
        warehouse: null,
        reason: `No warehouse found within ${SERVICE_RADIUS_KM} km radius`
      }
    }

    return {
      warehouse: null,
      reason:
        'Pincode not in any warehouse service area and coordinates not provided'
    }
  }

  if (warehousesByPincode.length === 1) {
    return {
      warehouse: warehousesByPincode[0],
      reason: 'Warehouse found for pincode'
    }
  }

  if (latitude !== undefined && longitude !== undefined) {
    const nearest = findNearestWarehouse(
      warehousesByPincode,
      latitude,
      longitude
    )

    if (nearest) {
      return {
        warehouse: nearest.warehouse,
        reason: `Multiple warehouses serve this pincode, nearest selected (${nearest.distance.toFixed(
          2
        )} km away)`
      }
    }
  }

  return {
    warehouse: warehousesByPincode[0],
    reason: 'Multiple warehouses serve this pincode, first selected'
  }
}

/**
 * Calculate average rating for a product
 */
async function getProductRating(productId) {
  try {
    const result = await prisma.rating.aggregate({
      where: {
        productId
      },
      _avg: {
        rating: true
      },
      _count: {
        rating: true
      }
    })

    return {
      average: result._avg.rating || 0,
      count: result._count.rating || 0
    }
  } catch (error) {
    logger.error('[Popular Products] Error calculating rating', {
      error: error.message
    })
    return { average: 0, count: 0 }
  }
}

/**
 * Product savedAmount = product.mrp - product.finalPrice
 * Variant savedAmount = variant.mrp - variant.sellingPrice
 */
function calculateSavedAmount(mrp, sellingAmount) {
  const mrpValue = Number(mrp || 0)
  const sellingValue = Number(sellingAmount || 0)

  return mrpValue > sellingValue ? mrpValue - sellingValue : 0
}

function getProductFinalPrice(product) {
  return product?.finalPrice ?? product?.price ?? 0
}

function getVariantSellingPrice(variant) {
  return variant?.sellingPrice ?? variant?.price ?? 0
}

/**
 * If unit is stored as UUID, get actual Unit name.
 * If already stored as text, return same value.
 */
async function resolveUnitValue(value) {
  if (!value) return value

  if (!isValidUUID(value)) return value

  const unit = await prisma.unit.findUnique({
    where: { id: value },
    select: {
      name: true,
      shortCode: true
    }
  })

  return unit?.name || value
}

/**
 * If unitType is stored as UUID, get actual UnitType name.
 * If already stored as text, return same value.
 */
async function resolveUnitTypeValue(value) {
  if (!value) return value

  if (!isValidUUID(value)) return value

  const unitType = await prisma.unitType.findUnique({
    where: { id: value },
    select: {
      name: true
    }
  })

  return unitType?.name || value
}

/**
 * Normalize product and variant unit/unitType fields.
 */
async function normalizeProductUnitFields(product) {
  if (!product) return product

  const normalizedProduct = {
    ...product,
    unit: await resolveUnitValue(product.unit),
    unitType: await resolveUnitTypeValue(product.unitType)
  }

  if (Array.isArray(product.variants)) {
    normalizedProduct.variants = await Promise.all(
      product.variants.map(async variant => ({
        ...variant,
        unit: await resolveUnitValue(variant.unit),
        unitType: await resolveUnitTypeValue(variant.unitType)
      }))
    )
  }

  return normalizedProduct
}

async function getCartProductMap(userId) {
  if (!userId) return {}

  const carts = await prisma.cart.findMany({
    where: { userId },
    include: {
      items: {
        select: {
          productId: true,
          quantity: true
        }
      }
    }
  })

  if (!carts.length) return {}

  return carts.reduce((map, cart) => {
    for (const item of cart.items) {
      map[item.productId] = (map[item.productId] || 0) + item.quantity
    }
    return map
  }, {})
}

function buildBaseVariant(product, discount) {
  const productFinalPrice = getProductFinalPrice(product)
  const stockQty = product.stock != null ? Math.max(0, parseInt(product.stock, 10) || 0) : 0
  const inStock = stockQty > 0
  const isOutOfStock = !inStock
  const isAvailable = inStock && product.isActive !== false && product.status === 'APPROVED'
  const status = isOutOfStock ? 'OUT_OF_STOCK' : 'ACTIVE'

  return {
    id: product.id,
    sku: null,
    gtin: null,
    name: product.name,
    variantName: product.name,
    unit: product.unit || null,
    unitType: product.unitType || null,
    measurement: product.measurement || null,

    mrp: product.mrp || null,
    price: productFinalPrice,
    finalPrice: productFinalPrice,
    sellingPrice: productFinalPrice,

    discount: discount > 0 ? discount : null,
    stock: stockQty,
    stockQuantity: stockQty,
    inStock: inStock,
    in_stock: inStock,
    isOutOfStock: isOutOfStock,
    is_out_of_stock: isOutOfStock,
    outOfStock: isOutOfStock,
    out_of_stock: isOutOfStock,
    isAvailable: isAvailable,
    available: isAvailable,
    is_available: isAvailable,
    minOrderQty: product.minOrderQty ?? 1,
    maxOrderQty: product.maxOrderQty ?? null,
    lowStockThreshold: null,
    images: product.images || [],
    isEnabled: true,
    status: status,
    rawStatus: product.status || 'ACTIVE',
    isBaseProduct: true,

    savedAmount: calculateSavedAmount(product.mrp, productFinalPrice)
  }
}

/**
 * Format product for response with all required fields
 */
async function formatProduct(product, totalSales) {
  product = await normalizeProductUnitFields(product)

  const rating = await getProductRating(product.id)
  const productFinalPrice = getProductFinalPrice(product)
  const stockQty = product.stock != null ? Math.max(0, parseInt(product.stock, 10) || 0) : 0
  const inStock = stockQty > 0
  const isOutOfStock = !inStock
  const isAvailable = inStock && product.isActive !== false && product.status === 'APPROVED'

  const discount =
    product.mrp && Number(product.mrp) > Number(productFinalPrice)
      ? Math.round(
          ((Number(product.mrp) - Number(productFinalPrice)) /
            Number(product.mrp)) *
            100
        )
      : 0

  const savedAmount = calculateSavedAmount(product.mrp, productFinalPrice)

  const mappedVariants = (mapVariants(product.variants || []) || []).map(
    variant => {
      const variantSellingPrice = getVariantSellingPrice(variant)
      const vStock = variant.stockQuantity != null ? Math.max(0, parseInt(variant.stockQuantity, 10) || 0) : (variant.stock != null ? Math.max(0, parseInt(variant.stock, 10) || 0) : 0)
      const vInStock = vStock > 0
      const vIsOutOfStock = !vInStock
      const vIsAvailable = vInStock && variant.isEnabled !== false && variant.status !== 'INACTIVE'
      const vStatus = vIsOutOfStock ? 'OUT_OF_STOCK' : (variant.status || 'ACTIVE')

      return {
        ...variant,

        // Keeping price key for frontend compatibility.
        // Internally it now uses sellingPrice.
        price: variantSellingPrice,
        sellingPrice: variantSellingPrice,

        stock: vStock,
        stockQuantity: vStock,
        inStock: vInStock,
        in_stock: vInStock,
        isOutOfStock: vIsOutOfStock,
        is_out_of_stock: vIsOutOfStock,
        outOfStock: vIsOutOfStock,
        out_of_stock: vIsOutOfStock,
        isAvailable: vIsAvailable,
        available: vIsAvailable,
        is_available: vIsAvailable,
        status: vStatus,

        isBaseProduct: false,
        savedAmount: calculateSavedAmount(variant.mrp, variantSellingPrice)
      }
    }
  )

  const inStockMappedVariants = mappedVariants.filter(
    v => (v.stockQuantity ?? v.stock ?? 0) > 0
  )

  const variants = []
  if (stockQty > 0 && inStockMappedVariants.length > 0) {
    variants.push(buildBaseVariant(product, discount))
  }
  variants.push(...inStockMappedVariants)

  const hasVariants = variants.length > 0
  const totalVariantsStock = hasVariants
    ? variants.reduce((sum, v) => sum + (v.stock || 0), 0)
    : stockQty
  const allVariantsOutOfStock = hasVariants
    ? variants.every(v => (v.stock || 0) <= 0)
    : isOutOfStock

  // If base product is 0 stock but an in-stock variant exists, use that variant for top-level display
  let effectivePrice = productFinalPrice
  let effectiveFinalPrice = productFinalPrice
  let effectiveMrp = product.mrp
  let effectiveUnit = product.unit
  let effectiveUnitType = product.unitType || null
  let effectiveMeasurement = product.measurement || null
  let effectiveStock = stockQty
  let effectiveInStock = inStock
  let effectiveIsOutOfStock = isOutOfStock

  if (stockQty <= 0 && inStockMappedVariants.length > 0) {
    const firstAvail = inStockMappedVariants[0]
    effectivePrice = firstAvail.price
    effectiveFinalPrice = firstAvail.sellingPrice || firstAvail.price
    effectiveMrp = firstAvail.mrp
    effectiveUnit = firstAvail.unit
    effectiveUnitType = firstAvail.unitType || effectiveUnitType
    effectiveMeasurement = firstAvail.measurement || effectiveMeasurement
    effectiveStock = firstAvail.stock
    effectiveInStock = true
    effectiveIsOutOfStock = false
  }

  const effectiveDiscount =
    effectiveMrp && Number(effectiveMrp) > Number(effectiveFinalPrice)
      ? Math.round(
          ((Number(effectiveMrp) - Number(effectiveFinalPrice)) /
            Number(effectiveMrp)) *
            100
        )
      : 0

  const effectiveSavedAmount = calculateSavedAmount(effectiveMrp, effectiveFinalPrice)

  return {
    id: product.id,
    name: product.name,
    description: product.description,

    // Product price is now finalPrice
    price: effectivePrice,
    finalPrice: effectiveFinalPrice,
    mrp: effectiveMrp,

    discount: effectiveDiscount > 0 ? effectiveDiscount : null,
    savedAmount: effectiveSavedAmount > 0 ? effectiveSavedAmount : null,

    images: product.images || [],
    unit: effectiveUnit,
    unitType: effectiveUnitType,
    measurement: effectiveMeasurement,
    stock: effectiveStock,
    stockQuantity: effectiveStock,
    inStock: effectiveInStock,
    in_stock: effectiveInStock,
    isOutOfStock: effectiveIsOutOfStock,
    is_out_of_stock: effectiveIsOutOfStock,
    outOfStock: effectiveIsOutOfStock,
    out_of_stock: effectiveIsOutOfStock,
    isAvailable: effectiveInStock,
    available: effectiveInStock,
    is_available: effectiveInStock,
    allVariantsOutOfStock: allVariantsOutOfStock,
    totalStock: totalVariantsStock,
    status: effectiveIsOutOfStock && !hasVariants ? 'OUT_OF_STOCK' : (product.status || 'ACTIVE'),
    rawStatus: product.status || 'APPROVED',
    minOrderQty: product.minOrderQty ?? 1,
    maxOrderQty: product.maxOrderQty ?? null,
    isFeatured: product.isFeatured || false,
    brand: product.brand
      ? {
          id: product.brand.id,
          name: product.brand.name,
          image: product.brand.image
        }
      : null,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name || 'Unnamed Category'
        }
      : null,
    subCategory: product.subCategory
      ? {
          id: product.subCategory.id,
          name: product.subCategory.name || 'Unnamed SubCategory',
          categoryId: product.subCategory.categoryId
        }
      : null,
    rating: rating.average,
    ratingCount: rating.count,
    weight: product.weight || 0,
    totalSales: totalSales || 0,
    createdAt: product.createdAt,
    variants
  }
}

/**
 * Get most popular/trending products
 * GET /api/v1/products/popular
 */
export const getPopularProducts = asyncHandler(async (req, res) => {
  const pincode = req.query.pincode

  const latitude =
    req.query.latitude !== undefined
      ? parseFloat(req.query.latitude)
      : undefined

  const longitude =
    req.query.longitude !== undefined
      ? parseFloat(req.query.longitude)
      : undefined

  const limit = Math.min(
    req.query.limit ? parseInt(req.query.limit, 10) : DEFAULT_LIMIT,
    MAX_LIMIT
  )

  logger.info('[Popular Products] Fetching popular products', {
    pincode,
    limit
  })

  const userId = req.user?.id || null

  let wishlistProductIds = []

  if (userId) {
    const wishlist = await prisma.wishlist.findUnique({
      where: { userId },
      select: { items: true }
    })

    if (wishlist?.items?.length) {
      wishlistProductIds = wishlist.items
        .filter(item => item.status === 'ACTIVE')
        .map(item => item.productId)
    }
  }

  const cartProductMap = await getCartProductMap(userId)

  const { warehouse, reason } = await selectWarehouse(
    pincode,
    latitude,
    longitude
  )

  // Warehouse check bypassed for popular products: if none found, we proceed without warehouse filter.

  const salesWhere = {
    product: {
      isActive: true,
      status: 'APPROVED'
    }
  };
  if (warehouse) {
    salesWhere.product.warehouseId = warehouse.id;
  }

  const salesAggregation = await prisma.sales.groupBy({
    by: ['productId'],
    where: salesWhere,
    _sum: {
      quantity: true,
      total: true
    },
    _count: {
      id: true
    },
    orderBy: {
      _sum: {
        quantity: 'desc'
      }
    },
    take: limit * 2
  })

  const productSalesMap = new Map()

  salesAggregation.forEach(sale => {
    productSalesMap.set(sale.productId, {
      totalQuantity: sale._sum.quantity || 0,
      totalRevenue: sale._sum.total || 0,
      orderCount: sale._count.id || 0
    })
  })

  let products = []
  const productIds = Array.from(productSalesMap.keys())

  const fallbackWhere = {
    isActive: true,
    status: 'APPROVED',
    stock: { gt: 0 },
    isFeatured: true
  };
  if (warehouse) {
    fallbackWhere.warehouseId = warehouse.id;
  }

  if (productIds.length === 0) {
    products = await prisma.product.findMany({
      where: fallbackWhere,
      orderBy: [
        { isFeatured: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit,
      select: productSelectFields()
    })
  } else {
    const idsWhere = {
      id: { in: productIds },
      isActive: true,
      status: 'APPROVED'
    };
    if (warehouse) {
      idsWhere.warehouseId = warehouse.id;
    }
    products = await prisma.product.findMany({
      where: idsWhere,
      take: limit,
      select: productSelectFields()
    })

    products.sort((a, b) => {
      const salesA = productSalesMap.get(a.id)?.totalQuantity || 0
      const salesB = productSalesMap.get(b.id)?.totalQuantity || 0

      return salesB - salesA
    })

  }

  await resolveProductPrices(products, req.query.channel || 'ONLINE')

  if (req.isTranslated) {

  }

  const formattedProducts = await Promise.all(
    products.map(async product => {
      const salesData = productSalesMap.get(product.id) || {
        totalQuantity: 0,
        totalRevenue: 0,
        orderCount: 0
      }

      const formatted = await formatProduct(product, salesData.totalQuantity)

      return {
        ...formatted,
        isWishlistAdded: userId
          ? wishlistProductIds.includes(product.id)
          : false,
        cartItemCount: cartProductMap[product.id] || 0
      }
    })
  )

  logger.info('[Popular Products] Popular products fetched', {
    warehouseId: warehouse?.id || null,
    total: formattedProducts.length
  })

  const successMessage = req.t ? req.t("PRODUCT_FETCHED") : "Popular products fetched successfully";

  return res.status(200).json({
    success: true,
    data: {
      serviceable: !!warehouse,
      warehouse: warehouse ? {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        pincodeList: warehouse.servicePincodes
      } : null,
      products: formattedProducts,
      count: formattedProducts.length,
      reason
    },
    message: successMessage
  })
})

function productSelectFields() {
  return {
    id: true,
    name: true,
    description: true,

    // Keep price also if frontend still needs old key.
    price: true,
    finalPrice: true,
    mrp: true,

    images: true,
    unit: true,
    unitType: true,
    measurement: true,
    minOrderQty: true,
    maxOrderQty: true,
    stock: true,
    isFeatured: true,
    brand: {
      select: {
        id: true,
        name: true,
        image: true
      }
    },
    category: {
      select: {
        id: true,
        name: true
      }
    },
    subCategory: {
      select: {
        id: true,
        name: true,
        categoryId: true
      }
    },
    weight: true,
    createdAt: true,
    ...variantsInclude
  }
}