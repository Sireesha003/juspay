// controllers/productsController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import { PriceResolverService } from '../services/priceResolverService.js'
import logger from '../utils/logger.js'
import { findNearestWarehouse } from '../utils/warehouseUtils.js'
import { isValidUUID } from '../utils/uuidValidator.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { getWishlistProductIds, attachWishlistFlag } from '../utils/wishListHelper.js'
import {
  mapVariants,
  mapVariantsMinimal,
  variantsInclude,
  variantsIncludeMinimal
} from '../utils/variantHelper.js'


const SERVICE_RADIUS_KM = 12
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

async function resolveProductPrices(products, channel = 'ONLINE') {
  if (!products) return products;
  const isArray = Array.isArray(products);
  const list = isArray ? products : [products];
  
  await Promise.all(
    list.map(async (product) => {
      let wId = product.warehouseId;
      if (!wId) {
        const dbProduct = await prisma.product.findUnique({
          where: { id: product.id },
          select: { warehouseId: true }
        });
        wId = dbProduct?.warehouseId;
        product.warehouseId = wId;
      }

      const cleanChannel = channel.toUpperCase();
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
        await Promise.all(
          product.variants.map(async (variant) => {
            const resolvedVariant = await PriceResolverService.resolvePrice({
              productId: product.id,
              productVariantId: variant.id,
              channel: targetChannel
            });
            variant.sellingPrice = resolvedVariant.sellingPrice;
            variant.mrp = resolvedVariant.mrp;
            variant.price = resolvedVariant.sellingPrice;
          })
        );
      }
    })
  );
  
  return isArray ? list : list[0];
}

function escapeLiteralForLike(s) {
  if (typeof s !== 'string') return s
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
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

async function selectWarehouse(pincode, latitude, longitude) {
  let warehousesByPincode = []
  if (pincode) {
    warehousesByPincode = await prisma.warehouse.findMany({
      where: {
        servicePincodes: {
          has: String(pincode)
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
  }

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
    logger.error('[Products] Error calculating rating', {
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

const unitCache = {}
const unitTypeCache = {}

/**
 * If unit/unitType is stored as UUID, get actual name from Unit / UnitType table.
 * If it is already stored as text, return same value.
 */
async function resolveUnitValue(value) {
  if (!value) return value

  if (!isValidUUID(value)) return value

  if (unitCache[value] !== undefined) {
    return unitCache[value]
  }

  const unit = await prisma.unit.findUnique({
    where: { id: value },
    select: {
      name: true,
      shortCode: true
    }
  })

  const result = unit?.name || value
  unitCache[value] = result
  return result
}

async function resolveUnitTypeValue(value) {
  if (!value) return value

  if (!isValidUUID(value)) return value

  if (unitTypeCache[value] !== undefined) {
    return unitTypeCache[value]
  }

  const unitType = await prisma.unitType.findUnique({
    where: { id: value },
    select: {
      name: true
    }
  })

  const result = unitType?.name || value
  unitTypeCache[value] = result
  return result
}

function buildProductWhereClause(baseWhere, query) {
  const { minPrice, maxPrice, brand, inStock, isFeatured } = query
  const where = { ...baseWhere }

  const searchTerm = (query.search || query.query || query.q || '').trim()
  if (searchTerm) {
    where.OR = [
      { name: { contains: searchTerm, mode: 'insensitive' } },
      { shortDescription: { contains: searchTerm, mode: 'insensitive' } },
      { brand: { name: { contains: searchTerm, mode: 'insensitive' } } },
      { tags: { hasSome: [searchTerm] } }
    ]
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.finalPrice = {}
    if (minPrice !== undefined) {
      where.finalPrice.gte = parseFloat(minPrice)
    }
    if (maxPrice !== undefined) {
      where.finalPrice.lte = parseFloat(maxPrice)
    }
  }

  if (brand) {
    where.brand = {
      name: {
        equals: brand.trim(),
        mode: 'insensitive'
      }
    }
  }

  if (inStock !== undefined) {
    const isStockOnly = inStock === true || inStock === 'true'
    if (isStockOnly) {
      where.stock = { gt: 0 }
    } else {
      where.stock = 0
    }
  }

  if (isFeatured !== undefined) {
    where.isFeatured = isFeatured === true || isFeatured === 'true'
  }

  if (query.tag) {
    where.tags = { has: query.tag }
  }

  return where
}

function buildProductOrderBy(sortBy, sortOrder) {
  let orderBy = { createdAt: 'desc' }

  if (sortBy) {
    const order = sortOrder === 'desc' ? 'desc' : 'asc'
    if (sortBy === 'price') {
      orderBy = { finalPrice: order }
    } else if (sortBy === 'price_asc') {
      orderBy = { finalPrice: 'asc' }
    } else if (sortBy === 'price_desc') {
      orderBy = { finalPrice: 'desc' }
    } else if (sortBy === 'name') {
      orderBy = { name: order }
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: order }
    }
  }

  return orderBy
}

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

async function formatProduct(product) {
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

        // Keep price key for frontend compatibility, but value is sellingPrice now.
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

  return {
    id: product.id,
    name: product.name,
    description: product.description,

    // Product price is now based on finalPrice.
    price: effectivePrice,
    finalPrice: effectiveFinalPrice,
    mrp: effectiveMrp,

    discount: effectiveDiscount > 0 ? effectiveDiscount : null,
    savedAmount: calculateSavedAmount(effectiveMrp, effectiveFinalPrice),

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
    createdAt: product.createdAt,
    flashDealEnd: product.flashDealEnd || null,
    variants
  }
}

export const getProductsByCategory = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null
  const wishlistIds = await getWishlistProductIds(userId)
  const cartProductMap = await getCartProductMap(userId)

  const { categoryId } = req.params

  if (!categoryId) {
    return errorResponse(res, 400, 'Category ID is required')
  }

  if (!isValidUUID(categoryId)) {
    return errorResponse(res, 400, 'Invalid category ID format')
  }

  const pincode = req.query.pincode
  const latitude = req.query.latitude
    ? parseFloat(req.query.latitude)
    : undefined
  const longitude = req.query.longitude
    ? parseFloat(req.query.longitude)
    : undefined

  const page = req.query.page ? parseInt(req.query.page, 10) : 1
  const limit = Math.min(
    req.query.limit ? parseInt(req.query.limit, 10) : DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  )

  const { minPrice, maxPrice, brand, inStock, isFeatured, sortBy, sortOrder } = req.query

  const { warehouse, reason } = await selectWarehouse(
    pincode,
    latitude,
    longitude
  )

  if (!warehouse) {
    return successResponse(
      res,
      200,
      {
        serviceable: false,
        warehouse: null,
        products: [],
        total: 0,
        reason
      },
      'Pincode not serviceable'
    )
  }

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, isActive: true }
  })

  if (!category || !category.isActive) {
    return errorResponse(res, 404, 'Category not found or inactive')
  }

  const skip = (page - 1) * limit

  const baseWhere = {
    warehouseId: warehouse.id,
    isActive: true,
    status: 'APPROVED',
    categoryId
  }

  const where = buildProductWhereClause(baseWhere, req.query)
  const orderBy = buildProductOrderBy(sortBy, sortOrder)

  const products = await prisma.product.findMany({
    where,
    skip,
    take: limit,
    orderBy,
    select: {
      id: true,
      name: true,
      price: true,
      finalPrice: true,
      mrp: true,
      stock: true,
      images: true,
      unit: true,
      unitType: true,
      measurement: true,
      minOrderQty: true,
      maxOrderQty: true,
      brand: true,
      category: true,
      subCategory: true,
      description: true,
      weight: true,
      createdAt: true,
      isFeatured: true,
      ...variantsInclude
    }
  })

  await resolveProductPrices(products, req.query.channel || 'ONLINE')

  if (req.isTranslated) {

  }

  const formattedProducts = await Promise.all(
    products.map(async product => {
      const formatted = await formatProduct(product)

      return {
        ...formatted,
        savedAmount: calculateSavedAmount(
          product.mrp,
          getProductFinalPrice(product)
        ),
        isWishlistAdded: wishlistIds.includes(product.id),
        cartItemCount: cartProductMap[product.id] || 0
      }
    })
  )

  const total = await prisma.product.count({
    where
  })

  return successResponse(
    res,
    200,
    {
      serviceable: true,
      warehouse,
      category,
      products: formattedProducts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      reason
    },
    'Products fetched successfully'
  )
})

export const getProductsBySubCategory = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null
  const wishlistIds = await getWishlistProductIds(userId)
  const cartProductMap = await getCartProductMap(userId)

  const { subCategoryId } = req.params

  if (!isValidUUID(subCategoryId)) {
    return errorResponse(res, 400, 'Invalid sub-category ID format')
  }

  const pincode = req.query.pincode
  const latitude = req.query.latitude
    ? parseFloat(req.query.latitude)
    : undefined
  const longitude = req.query.longitude
    ? parseFloat(req.query.longitude)
    : undefined

  const page = parseInt(req.query.page || 1, 10)
  const limit = Math.min(
    parseInt(req.query.limit || DEFAULT_PAGE_SIZE, 10),
    MAX_PAGE_SIZE
  )

  const { minPrice, maxPrice, brand, inStock, isFeatured, sortBy, sortOrder } = req.query

  const { warehouse, reason } = await selectWarehouse(
    pincode,
    latitude,
    longitude
  )

  if (!warehouse) {
    return successResponse(
      res,
      200,
      {
        serviceable: false,
        products: [],
        total: 0,
        reason
      },
      'Pincode not serviceable'
    )
  }

  const subCategory = await prisma.subCategory.findUnique({
    where: { id: subCategoryId },
    select: { id: true, name: true, isActive: true, categoryId: true }
  })

  if (!subCategory || !subCategory.isActive) {
    return errorResponse(res, 404, 'Sub-category not found or inactive')
  }

  const skip = (page - 1) * limit

  const baseWhere = {
    warehouseId: warehouse.id,
    isActive: true,
    status: 'APPROVED',
    subCategoryId
  }

  const where = buildProductWhereClause(baseWhere, req.query)
  const orderBy = buildProductOrderBy(sortBy, sortOrder)

  const products = await prisma.product.findMany({
    where,
    skip,
    take: limit,
    orderBy,
    select: {
      id: true,
      name: true,
      price: true,
      finalPrice: true,
      mrp: true,
      images: true,
      stock: true,
      unit: true,
      unitType: true,
      measurement: true,
      minOrderQty: true,
      maxOrderQty: true,
      brand: true,
      category: true,
      subCategory: true,
      description: true,
      weight: true,
      createdAt: true,
      isFeatured: true,
      ...variantsInclude
    }
  })

  await resolveProductPrices(products, req.query.channel || 'ONLINE')

  if (req.isTranslated) {

  }

  const formattedProducts = await Promise.all(
    products.map(async product => {
      const formatted = await formatProduct(product)

      return {
        ...formatted,
        savedAmount: calculateSavedAmount(
          product.mrp,
          getProductFinalPrice(product)
        ),
        isWishlistAdded: wishlistIds.includes(product.id),
        cartItemCount: cartProductMap[product.id] || 0
      }
    })
  )

  const total = await prisma.product.count({
    where
  })

  return successResponse(
    res,
    200,
    {
      serviceable: true,
      warehouse,
      subCategory,
      products: formattedProducts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      reason
    },
    'Products fetched successfully'
  )
})

export const getProductById = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null
  const wishlistIds = await getWishlistProductIds(userId)
  const cartProductMap = await getCartProductMap(userId)

  const { productId } = req.params

  if (!isValidUUID(productId)) {
    return errorResponse(res, 400, 'Invalid product ID format')
  }

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      status: 'APPROVED'
    },
    select: {
      id: true,
      name: true,
      price: true,
      finalPrice: true,
      mrp: true,
      images: true,
      stock: true,
      unit: true,
      unitType: true,
      measurement: true,
      minOrderQty: true,
      maxOrderQty: true,
      isActive: true,
      brand: true,
      category: true,
      subCategory: true,
      tags: true,
      warehouseId: true,
      warehouse: {
        include: {
          warehouseBusiness: true,
          warehouseLocations: true,
          warehouseBusinessDocuments: true,
          businessSettings: true
        }
      },
      description: true,
      weight: true,
      manufacturer: true,
      madeIn: true,
      fssaiLicNo: true,
      isReturnable: true,
      isCancelable: true,
      returnableDays: true,
      createdAt: true,
      isFeatured: true,
      ...variantsInclude
    }
  })

  if (!product) return errorResponse(res, 400, 'Product not found')

  if (!product.isActive) {
    return errorResponse(res, 400, 'Product not available')
  }

  await resolveProductPrices(product, req.query.channel || 'ONLINE')

  if (req.isTranslated) {

  }

  const formattedProduct = await formatProduct(product)

  // Dynamic Seller Details resolution from Partner / Warehouse & BusinessSettings records
  const wb = Array.isArray(product.warehouse?.warehouseBusiness) ? product.warehouse.warehouseBusiness[0] : null
  const wl = Array.isArray(product.warehouse?.warehouseLocations) ? product.warehouse.warehouseLocations[0] : null
  const wdoc = Array.isArray(product.warehouse?.warehouseBusinessDocuments) ? product.warehouse.warehouseBusinessDocuments[0] : null
  const bs = product.warehouse?.businessSettings || null

  const sellerName = wb?.displayName || wb?.legalBusinessName || bs?.businessName || product.warehouse?.name || product.manufacturer || 'FNV RETAIL PRIVATE LIMITED - Madhapur'
  const fssaiNumber = product.fssaiLicNo || wdoc?.fssaiNumber || '13624013001425'
  const sellerAddress = wl?.fullAddress || bs?.address || product.warehouse?.address
    ? (typeof product.warehouse.address === 'string'
        ? product.warehouse.address
        : [product.warehouse.address?.line1, product.warehouse.address?.line2, product.warehouse.address?.city, product.warehouse.address?.state, product.warehouse.address?.pincode].filter(Boolean).join(', '))
    : 'Gf, Land Bearing Plot NO S/7A, S/7B and S/7C, Khanamet Village, Kondapur, Serlingampally Circle No 20, Hyderabad, Telangana-500084'

  const sellerPhone = bs?.contactNo || product.warehouse?.phone || product.warehouse?.contactNumber || product.warehouse?.alternateMobileNumber || '+91 9876543210'
  const sellerEmail = bs?.email || 'support@villagkart.com'

  const sellerDetails = {
    sellerName,
    name: sellerName,
    fssaiNumber,
    fssaiLicNo: fssaiNumber,
    address: sellerAddress,
    sellerAddress,
    customerCareEmail: sellerEmail,
    customerCarePhone: sellerPhone
  }

  // Brand resolution fallback so Brand never shows N/A if missing
  const resolvedBrandName = product.brand?.name || product.manufacturer || (product.name ? product.name.trim().split(' ')[0] : 'Generic')

  // Fetch real similar products from the SAME Category / Subcategory
  let rawSimilarProducts = []
  try {
    rawSimilarProducts = await prisma.product.findMany({
      where: {
        id: { not: product.id },
        status: 'APPROVED',
        isActive: true,
        OR: [
          ...(product.subCategory?.id ? [{ subCategoryId: product.subCategory.id }] : []),
          ...(product.category?.id ? [{ categoryId: product.category.id }] : []),
          ...(product.brand?.id ? [{ brandId: product.brand.id }] : [])
        ]
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        price: true,
        finalPrice: true,
        mrp: true,
        images: true,
        stock: true,
        unit: true,
        unitType: true,
        measurement: true,
        minOrderQty: true,
        maxOrderQty: true,
        isActive: true,
        brand: true,
        category: true,
        subCategory: true,
        tags: true,
        description: true,
        isFeatured: true,
        ...variantsInclude
      }
    })
  } catch (err) {
    logger.warn('[Products] Error fetching similar products fallback', { error: err.message })
  }

  await resolveProductPrices(rawSimilarProducts, req.query.channel || 'ONLINE')

  const formattedSimilarProducts = await Promise.all(
    rawSimilarProducts.map(async (p) => {
      const formatted = await formatProduct(p)
      return {
        ...formatted,
        savedAmount: calculateSavedAmount(p.mrp, getProductFinalPrice(p)),
        isWishlistAdded: wishlistIds.includes(p.id),
        cartItemCount: cartProductMap[p.id] || 0
      }
    })
  )

  // Per unit price calculation (e.g. ₹17.4 / 100 ml)
  const currentFinalPrice = getProductFinalPrice(product)
  const measurementNum = parseFloat(product.measurement || '1') || 1
  const unitLabel = product.unit || 'Unit'
  const perUnitPriceVal = ((currentFinalPrice / measurementNum) * (unitLabel.toLowerCase().includes('g') || unitLabel.toLowerCase().includes('ml') ? 100 : 1)).toFixed(1)
  const perUnitPriceLabel = `₹${perUnitPriceVal} / ${unitLabel.toLowerCase().includes('g') || unitLabel.toLowerCase().includes('ml') ? '100 ' + unitLabel.toLowerCase() : unitLabel}`

  const returnDays = product.returnableDays || 3

  const productDetail = {
    ...formattedProduct,
    estimatedDeliveryTime: '10 MINS',
    perUnitPriceLabel: perUnitPriceLabel,

    brand: product.brand
      ? {
          id: product.brand.id,
          name: product.brand.name,
          image: product.brand.image
        }
      : {
          id: 'brand_gen',
          name: resolvedBrandName,
          image: null
        },
    brandName: resolvedBrandName,

    savedAmount: calculateSavedAmount(product.mrp, currentFinalPrice),
    isWishlistAdded: wishlistIds.includes(product.id),
    cartItemCount: cartProductMap[product.id] || 0,
    tags: product.tags || [],
    warehouse: product.warehouse,
    fssaiLicNo: fssaiNumber,
    fssaiLicense: fssaiNumber,
    manufacturer: product.manufacturer || null,
    madeIn: product.madeIn || 'India',

    paymentOffers: [
      {
        id: 'offer_mobi_100',
        title: '₹100 OFF',
        subtitle: 'Get ₹100 instant cashback on Mobikwik UPI',
        code: 'MOBIKWIK100'
      }
    ],

    trustBadges: {
      refundPolicy: `${returnDays * 24} Hours Refund*`,
      deliveryType: 'Fast Delivery',
      support: '24/7 Support'
    },

    highlights: Array.isArray(product.tags) && product.tags.length > 0
      ? product.tags
      : [
          `Revamp your cooking with ${product.name}, packed with essential nutrients.`,
          `Elevate your meals with high quality ${resolvedBrandName} choices.`,
          `Packed with essential vitamins for your child's growth and development.`
        ],

    returnPolicyDetails: {
      isReturnable: product.isReturnable ?? true,
      returnableDays: returnDays,
      policyText: `- This item is eligible for a refund within ${returnDays} days of purchase in the unlikely event of a damaged, defective item. Please ensure the product is in its original condition, with manufacturer packaging, for a successful pick-up.\n- In case of an incorrect item, a refund or replacement request can be raised only if the item is sealed, unopened, and unused.`
    },

    sellerDetails: sellerDetails,

    otherInformation: {
      countryOfOrigin: product.madeIn || 'India',
      shelfLifeDays: 270,
      shelfLifeText: 'The Shelf life of this product is 270 days from the date of manufacture or packed by.',
      disclaimer: 'The image(s) shown are representative of the actual product. While every effort has been made to maintain accurate and up to date product related content, it is recommended to read product labels, batch and manufacturing/packing details along with warnings and directions before using or consuming a packed product.'
    },

    customerCareEmail: sellerEmail,
    customerCarePhone: sellerPhone,
    disclaimer: 'The image(s) shown are representative of the actual product. While every effort has been made to maintain accurate and up to date product related content, it is recommended to read product labels, batch and manufacturing/packing details along with warnings and directions before using or consuming a packed product.',
    isReturnable: product.isReturnable ?? true,
    isCancelable: product.isCancelable ?? false,
    returnableDays: returnDays,
    similarProducts: formattedSimilarProducts,
    relatedProducts: formattedSimilarProducts
  }

  return successResponse(
    res,
    200,
    productDetail,
    'Product fetched successfully'
  )
})

export const getSimilarProductsById = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null
  const wishlistIds = await getWishlistProductIds(userId)
  const cartProductMap = await getCartProductMap(userId)
  const { productId } = req.params

  if (!isValidUUID(productId)) {
    return errorResponse(res, 400, 'Invalid product ID format')
  }

  const target = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, categoryId: true, subCategoryId: true, brandId: true }
  })

  if (!target) return errorResponse(res, 404, 'Product not found')

  const similarList = await prisma.product.findMany({
    where: {
      id: { not: productId },
      status: 'APPROVED',
      isActive: true,
      OR: [
        ...(target.subCategoryId ? [{ subCategoryId: target.subCategoryId }] : []),
        ...(target.categoryId ? [{ categoryId: target.categoryId }] : []),
        ...(target.brandId ? [{ brandId: target.brandId }] : [])
      ]
    },
    take: 12,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      price: true,
      finalPrice: true,
      mrp: true,
      images: true,
      stock: true,
      unit: true,
      unitType: true,
      measurement: true,
      minOrderQty: true,
      maxOrderQty: true,
      isActive: true,
      brand: true,
      category: true,
      subCategory: true,
      tags: true,
      description: true,
      isFeatured: true,
      ...variantsInclude
    }
  })

  await resolveProductPrices(similarList, req.query.channel || 'ONLINE')

  const formattedSimilar = await Promise.all(
    similarList.map(async (p) => {
      const formatted = await formatProduct(p)
      return {
        ...formatted,
        savedAmount: calculateSavedAmount(p.mrp, getProductFinalPrice(p)),
        isWishlistAdded: wishlistIds.includes(p.id),
        cartItemCount: cartProductMap[p.id] || 0
      }
    })
  )

  return successResponse(res, 200, { similarProducts: formattedSimilar, products: formattedSimilar }, 'Similar products fetched successfully')
})

export const searchProducts = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null

  const wishlistIds = await getWishlistProductIds(userId)
  const cartProductMap = await getCartProductMap(userId)

  const pincode = req.query.pincode
  const latitude = req.query.latitude
    ? parseFloat(req.query.latitude)
    : undefined
  const longitude = req.query.longitude
    ? parseFloat(req.query.longitude)
    : undefined

  const page = req.query.page ? parseInt(req.query.page, 10) : 1
  const limit = Math.min(
    req.query.limit ? parseInt(req.query.limit, 10) : DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  )

  const search =
    (req.query.query || req.query.search || req.query.q || '').trim() ||
    undefined

  if (!pincode) {
    return errorResponse(res, 400, 'Pincode is required for product search')
  }

  const { warehouse, reason } = await selectWarehouse(
    pincode,
    latitude,
    longitude
  )

  if (!warehouse) {
    return successResponse(
      res,
      200,
      {
        serviceable: false,
        warehouse: null,
        products: [],
        total: 0,
        reason
      },
      'Pincode not serviceable'
    )
  }

  const { minPrice, maxPrice, brand, inStock, isFeatured, sortBy, sortOrder } = req.query

  const baseWhere = {
    warehouseId: warehouse.id,
    isActive: true,
    status: 'APPROVED'
  }

  if (search) {
    const searchTerm = search.trim()
    baseWhere.OR = [
      { name: { contains: searchTerm, mode: 'insensitive' } },
      { shortDescription: { contains: searchTerm, mode: 'insensitive' } },
      { brand: { name: { contains: searchTerm, mode: 'insensitive' } } },
      { tags: { hasSome: [searchTerm] } }
    ]
  }

  const where = buildProductWhereClause(baseWhere, req.query)
  const orderBy = buildProductOrderBy(sortBy, sortOrder)

  const skip = (page - 1) * limit
  const total = await prisma.product.count({ where })

  let products

  const hasFiltersOrSorting =
    minPrice !== undefined ||
    maxPrice !== undefined ||
    brand !== undefined ||
    inStock !== undefined ||
    isFeatured !== undefined ||
    sortBy !== undefined

  if (search && !hasFiltersOrSorting) {
    const searchTerm = search.trim()
    const searchEscaped = escapeLiteralForLike(searchTerm)

    const rankResult = await prisma.$queryRaw`
      SELECT p.id
      FROM "Product" p
      LEFT JOIN "Brand" b ON b.id = p."brandId"
      WHERE p."warehouseId" = ${warehouse.id}
        AND p."isActive" = true
        AND p."status" = 'APPROVED'
        AND (
          p.name ILIKE ${'%' + searchEscaped + '%'}
          OR p."shortDescription" ILIKE ${'%' + searchEscaped + '%'}
          OR b.name ILIKE ${'%' + searchEscaped + '%'}
          OR ${searchTerm} = ANY(p.tags)
        )
      ORDER BY
        CASE
          WHEN LOWER(p.name) = LOWER(${searchTerm}) THEN 0
          WHEN LOWER(p.name) LIKE LOWER(${searchEscaped}) || '%' THEN 1
          WHEN LOWER(p.name) LIKE '%' || LOWER(${searchEscaped}) || '%' THEN 2
          ELSE 3
        END,
        p."createdAt" DESC
      OFFSET ${skip} LIMIT ${limit}
    `

    const orderedIds = rankResult.map(row => row.id)

    if (orderedIds.length === 0) {
      products = []
    } else {
      const byId = await prisma.product.findMany({
        where: { id: { in: orderedIds } },
        select: {
          id: true,
          name: true,
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
          brand: true,
          category: true,
          subCategory: true,
          description: true,
          weight: true,
          createdAt: true,
          isFeatured: true,
          ...variantsInclude
        }
      })

      const idToIndex = Object.fromEntries(orderedIds.map((id, i) => [id, i]))
      products = byId.slice().sort((a, b) => idToIndex[a.id] - idToIndex[b.id])
    }
  } else {
    products = await prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      select: {
        id: true,
        name: true,
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
        brand: true,
        category: true,
        subCategory: true,
        description: true,
        weight: true,
        createdAt: true,
        isFeatured: true,
        ...variantsInclude
      }
    })
  }

  await resolveProductPrices(products, req.query.channel || 'ONLINE')

  // Compute Facets
  const facetProducts = await prisma.product.findMany({
    where,
    select: {
      price: true,
      finalPrice: true,
      brand: {
        select: { id: true, name: true }
      },
      category: {
        select: { id: true, name: true }
      }
    }
  })

  if (req.isTranslated) {

    const brands = facetProducts.map(p => p.brand).filter(Boolean);
    const categories = facetProducts.map(p => p.category).filter(Boolean);

  }

  const formattedProducts = await Promise.all(
    products.map(async product => {
      const formatted = await formatProduct(product)

      return {
        ...formatted,
        savedAmount: calculateSavedAmount(
          product.mrp,
          getProductFinalPrice(product)
        ),
        isWishlistAdded: wishlistIds.includes(product.id),
        cartItemCount: cartProductMap[product.id] || 0
      }
    })
  )

  const brandsMap = new Map()
  const categoriesMap = new Map()
  let facetMinPrice = Infinity
  let facetMaxPrice = -Infinity

  for (const p of facetProducts) {
    const itemPrice = p.finalPrice != null ? Number(p.finalPrice) : Number(p.price || 0)
    if (itemPrice < facetMinPrice) facetMinPrice = itemPrice
    if (itemPrice > facetMaxPrice) facetMaxPrice = itemPrice

    if (p.brand) {
      const bKey = `${p.brand.id}:${p.brand.name}`
      brandsMap.set(bKey, (brandsMap.get(bKey) || 0) + 1)
    }

    if (p.category) {
      const cKey = `${p.category.id}:${p.category.name}`
      categoriesMap.set(cKey, (categoriesMap.get(cKey) || 0) + 1)
    }
  }

  const facets = {
    brands: [...brandsMap.entries()].map(([k, count]) => {
      const [id, name] = k.split(':')
      return { id, name, count }
    }),
    categories: [...categoriesMap.entries()].map(([k, count]) => {
      const [id, name] = k.split(':')
      return { id, name, count }
    }),
    priceRange: {
      min: facetMinPrice === Infinity ? 0 : facetMinPrice,
      max: facetMaxPrice === -Infinity ? 0 : facetMaxPrice
    }
  }

  return successResponse(
    res,
    200,
    {
      serviceable: true,
      warehouse,
      products: formattedProducts,
      facets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      reason
    },
    'Products fetched successfully'
  )
})

export const getProductSuggestions = asyncHandler(async (req, res) => {
  const searchQuery = (req.query.query || req.query.q || '').trim()
  const { pincode, limit = 5 } = req.query

  const userId = req.user?.id || null

  if (searchQuery.length < 2) {
    return successResponse(res, 200, { suggestions: [] }, 'Query too short')
  }

  const { warehouse, reason } = await selectWarehouse(pincode)

  if (!warehouse) {
    return successResponse(
      res,
      200,
      {
        serviceable: false,
        suggestions: [],
        reason
      },
      'No serviceable warehouse found'
    )
  }

  const wishlistIds = await getWishlistProductIds(userId)
  const cartProductMap = await getCartProductMap(userId)

  const suggestions = await prisma.product.findMany({
    where: {
      warehouseId: warehouse.id,
      isActive: true,
      status: 'APPROVED',
      OR: [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { brand: { name: { contains: searchQuery, mode: 'insensitive' } } }
      ]
    },
    select: {
      id: true,
      name: true,
      images: true,
      price: true,
      finalPrice: true,
      mrp: true,
      unit: true,
      unitType: true,
      measurement: true,
      minOrderQty: true,
      maxOrderQty: true,
      stock: true,
      ...variantsIncludeMinimal
    },
    take: parseInt(limit, 10),
    orderBy: { name: 'asc' }
  })

  await resolveProductPrices(suggestions, req.query.channel || 'ONLINE')

  if (req.isTranslated) {

  }

  const normalizedSuggestions = await Promise.all(
    suggestions.map(product => normalizeProductUnitFields(product))
  )

  const formatted = normalizedSuggestions.map(p => {
    const productFinalPrice = getProductFinalPrice(p)

    const productDiscount =
      p.mrp && Number(p.mrp) > Number(productFinalPrice)
        ? Math.round(
            ((Number(p.mrp) - Number(productFinalPrice)) / Number(p.mrp)) * 100
          )
        : 0

    const mappedVariants = (mapVariantsMinimal(p.variants || []) || []).map(
      variant => {
        const variantSellingPrice = getVariantSellingPrice(variant)

        return {
          ...variant,

          // Keep price key for frontend compatibility, but value is sellingPrice now.
          price: variantSellingPrice,
          sellingPrice: variantSellingPrice,

          isBaseProduct: false,
          savedAmount: calculateSavedAmount(variant.mrp, variantSellingPrice)
        }
      }
    )

    const variants =
      mappedVariants.length > 0
        ? [
            {
              id: p.id,
              sku: null,
              gtin: null,
              name: p.name,
              variantName: p.name,
              unit: p.unit || null,
              unitType: p.unitType || null,
              measurement: p.measurement || null,

              mrp: p.mrp || null,
              price: productFinalPrice,
              finalPrice: productFinalPrice,
              sellingPrice: productFinalPrice,

              discount: productDiscount > 0 ? productDiscount : null,
              stock: p.stock ?? 0,
              stockQuantity: p.stock ?? 0,
              inStock: (p.stock ?? 0) > 0,
              in_stock: (p.stock ?? 0) > 0,
              isOutOfStock: (p.stock ?? 0) <= 0,
              is_out_of_stock: (p.stock ?? 0) <= 0,
              outOfStock: (p.stock ?? 0) <= 0,
              out_of_stock: (p.stock ?? 0) <= 0,
              isAvailable: (p.stock ?? 0) > 0,
              available: (p.stock ?? 0) > 0,
              minOrderQty: p.minOrderQty ?? 1,
              maxOrderQty: p.maxOrderQty ?? null,
              lowStockThreshold: null,
              images: p.images || [],
              isEnabled: true,
              status: (p.stock ?? 0) > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
              rawStatus: 'ACTIVE',
              isBaseProduct: true,

              savedAmount: calculateSavedAmount(p.mrp, productFinalPrice)
            },
            ...mappedVariants
          ]
        : []

    const pStock = p.stock ?? 0
    const pInStock = pStock > 0
    const pIsOutOfStock = !pInStock

    return {
      id: p.id,
      name: p.name,
      image: p.images?.[0] || null,

      price: productFinalPrice,
      finalPrice: productFinalPrice,
      mrp: p.mrp || null,
      savedAmount: calculateSavedAmount(p.mrp, productFinalPrice),

      unit: p.unit,
      unitType: p.unitType || null,
      measurement: p.measurement || null,
      stock: pStock,
      stockQuantity: pStock,
      inStock: pInStock,
      in_stock: pInStock,
      isOutOfStock: pIsOutOfStock,
      is_out_of_stock: pIsOutOfStock,
      outOfStock: pIsOutOfStock,
      out_of_stock: pIsOutOfStock,
      isAvailable: pInStock,
      available: pInStock,
      minOrderQty: p.minOrderQty ?? 1,
      maxOrderQty: p.maxOrderQty ?? null,
      isWishlistAdded: wishlistIds.includes(p.id),
      cartItemCount: cartProductMap[p.id] || 0,
      variants
    }
  })

  return successResponse(
    res,
    200,
    {
      serviceable: true,
      warehouse,
      suggestions: formatted,
      query: searchQuery
    },
    'Suggestions fetched successfully'
  )
})

/**
 * Get product filters metadata (price range, brands) for a category, subcategory, or search query.
 * GET /api/v1/products/filters
 */
export const getProductFilters = asyncHandler(async (req, res) => {
  const pincode = req.query.pincode
  const latitude = req.query.latitude ? parseFloat(req.query.latitude) : undefined
  const longitude = req.query.longitude ? parseFloat(req.query.longitude) : undefined
  
  const { categoryId, subCategoryId } = req.query
  const search = (req.query.query || req.query.search || req.query.q || '').trim() || undefined

  const { warehouse, reason } = await selectWarehouse(
    pincode,
    latitude,
    longitude
  )

  if (!warehouse) {
    return successResponse(
      res,
      200,
      {
        serviceable: false,
        priceRange: { min: 0, max: 0 },
        brands: [],
        reason
      },
      'Pincode not serviceable'
    )
  }

  // Base where query
  const baseWhere = {
    warehouseId: warehouse.id,
    isActive: true,
    status: 'APPROVED'
  }

  if (categoryId) {
    if (!isValidUUID(categoryId)) {
      return errorResponse(res, 400, 'Invalid category ID format')
    }
    baseWhere.categoryId = categoryId
  }

  if (subCategoryId) {
    if (!isValidUUID(subCategoryId)) {
      return errorResponse(res, 400, 'Invalid sub-category ID format')
    }
    baseWhere.subCategoryId = subCategoryId
  }

  if (search) {
    baseWhere.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { shortDescription: { contains: search, mode: 'insensitive' } },
      { brand: { name: { contains: search, mode: 'insensitive' } } },
      { tags: { hasSome: [search] } }
    ]
  }

  try {
    // 1. Calculate price range (min and max finalPrice)
    const priceAgg = await prisma.product.aggregate({
      where: baseWhere,
      _min: {
        price: true,
        finalPrice: true
      },
      _max: {
        price: true,
        finalPrice: true
      }
    })

    const minPrice = priceAgg._min.finalPrice ?? priceAgg._min.price ?? 0
    const maxPrice = priceAgg._max.finalPrice ?? priceAgg._max.price ?? 0

    // 2. Extract unique brands under these conditions
    const distinctBrands = await prisma.product.findMany({
      where: {
        ...baseWhere,
        brandId: { not: null }
      },
      select: {
        brand: {
          select: {
            id: true,
            name: true
          }
        }
      },
      distinct: ['brandId']
    })

    const brands = distinctBrands
      .map(p => p.brand)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))

    return successResponse(
      res,
      200,
      {
        serviceable: true,
        priceRange: {
          min: minPrice,
          max: maxPrice
        },
        brands
      },
      'Product filter metadata retrieved successfully'
    )
  } catch (error) {
    logger.error('[Products] Error retrieving filter metadata', {
      error: error.message,
      categoryId,
      subCategoryId,
      search
    })
    return errorResponse(res, 500, 'Failed to retrieve filter metadata')
  }
})

/**
 * GET /api/v1/products/shop-by-need
 * Get products belonging to categories marked as SPECIAL
 */
export const getShopByNeedProducts = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null
  const wishlistIds = await getWishlistProductIds(userId)
  const cartProductMap = await getCartProductMap(userId)

  const pincode = req.query.pincode
  const latitude = req.query.latitude ? parseFloat(req.query.latitude) : undefined
  const longitude = req.query.longitude ? parseFloat(req.query.longitude) : undefined

  const page = req.query.page ? parseInt(req.query.page, 10) : 1
  const limit = Math.min(
    req.query.limit ? parseInt(req.query.limit, 10) : DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  )

  const { warehouse, reason } = await selectWarehouse(pincode, latitude, longitude)

  if (!warehouse) {
    return successResponse(
      res,
      200,
      {
        serviceable: false,
        warehouse: null,
        products: [],
        total: 0,
        reason
      },
      'Pincode not serviceable'
    )
  }

  const skip = (page - 1) * limit

  const baseWhere = {
    warehouseId: warehouse.id,
    isActive: true,
    status: 'APPROVED',
    category: {
      isActive: true,
      categoryType: {
        has: 'SPECIAL'
      }
    }
  }

  const where = buildProductWhereClause(baseWhere, req.query)
  const orderBy = buildProductOrderBy(req.query.sortBy, req.query.sortOrder)

  const total = await prisma.product.count({ where })
  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: limit,
    select: {
      id: true,
      name: true,
      description: true,
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
      status: true,
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
  })

  await resolveProductPrices(products, req.query.channel || 'ONLINE')

  let formattedProducts = await Promise.all(
    products.map(async product => {
      const formatted = await formatProduct(product)
      return {
        ...formatted,
        cartItemCount: cartProductMap[product.id] || 0
      }
    })
  )

  formattedProducts = attachWishlistFlag(formattedProducts, wishlistIds, userId)
  const totalPages = Math.ceil(total / limit)

  return res.status(200).json({
    success: true,
    data: {
      serviceable: true,
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        pincodeList: warehouse.servicePincodes
      },
      products: formattedProducts,
      total,
      page,
      limit,
      totalPages,
      reason
    },
    message: req.t ? req.t("PRODUCT_FETCHED") : "Shop by Need products fetched successfully"
  })
})

/**
 * GET /api/v1/products/daily-deals
 * Get daily deals or highly discounted products
 */
export const getDailyDealsProducts = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null
  const wishlistIds = await getWishlistProductIds(userId)
  const cartProductMap = await getCartProductMap(userId)

  const pincode = req.query.pincode
  const latitude = req.query.latitude ? parseFloat(req.query.latitude) : undefined
  const longitude = req.query.longitude ? parseFloat(req.query.longitude) : undefined

  const page = req.query.page ? parseInt(req.query.page, 10) : 1
  const limit = Math.min(
    req.query.limit ? parseInt(req.query.limit, 10) : DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  )

  const { warehouse, reason } = await selectWarehouse(pincode, latitude, longitude)

  if (!warehouse) {
    return successResponse(
      res,
      200,
      {
        serviceable: false,
        warehouse: null,
        products: [],
        total: 0,
        reason
      },
      'Pincode not serviceable'
    )
  }

  const skip = (page - 1) * limit

  const baseWhere = {
    warehouseId: warehouse.id,
    isActive: true,
    status: 'APPROVED',
    stock: { gt: 0 }
  }

  const where = buildProductWhereClause(baseWhere, req.query)

  const allProducts = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
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
      status: true,
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
      tags: true,
      flashDealEnd: true,
      ...variantsInclude
    }
  })

  await resolveProductPrices(allProducts, req.query.channel || 'ONLINE')

  const dailyDeals = allProducts.filter(product => {
    const finalPrice = getProductFinalPrice(product)
    const isFlashExpired = product.flashDealEnd && new Date(product.flashDealEnd) <= new Date()
    if (isFlashExpired) return false

    const hasTag = product.tags && product.tags.some(tag => 
      ['daily-deal', 'daily-deals', 'deal-of-the-day', 'flash-deal', 'flash-sale'].includes(tag.toLowerCase())
    )
    const hasDiscount = product.mrp && Number(product.mrp) > Number(finalPrice)
    const isFlashActive = product.flashDealEnd && new Date(product.flashDealEnd) > new Date()
    return hasTag || hasDiscount || isFlashActive
  })

  dailyDeals.sort((a, b) => {
    const hasTagA = a.tags && a.tags.some(tag => ['daily-deal', 'daily-deals', 'deal-of-the-day'].includes(tag.toLowerCase())) ? 1 : 0
    const hasTagB = b.tags && b.tags.some(tag => ['daily-deal', 'daily-deals', 'deal-of-the-day'].includes(tag.toLowerCase())) ? 1 : 0
    if (hasTagB !== hasTagA) return hasTagB - hasTagA

    const priceA = getProductFinalPrice(a)
    const priceB = getProductFinalPrice(b)
    const discountA = a.mrp ? ((Number(a.mrp) - Number(priceA)) / Number(a.mrp)) * 100 : 0
    const discountB = b.mrp ? ((Number(b.mrp) - Number(priceB)) / Number(b.mrp)) * 100 : 0
    return discountB - discountA
  })

  const total = dailyDeals.length
  const paginatedProducts = dailyDeals.slice(skip, skip + limit)

  let formattedProducts = await Promise.all(
    paginatedProducts.map(async product => {
      const formatted = await formatProduct(product)
      return {
        ...formatted,
        cartItemCount: cartProductMap[product.id] || 0
      }
    })
  )

  formattedProducts = attachWishlistFlag(formattedProducts, wishlistIds, userId)
  const totalPages = Math.ceil(total / limit)

  return res.status(200).json({
    success: true,
    data: {
      serviceable: true,
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        pincodeList: warehouse.servicePincodes
      },
      products: formattedProducts,
      total,
      page,
      limit,
      totalPages,
      reason
    },
    message: req.t ? req.t("PRODUCT_FETCHED") : "Daily deals fetched successfully"
  })
})

/**
 * GET /api/v1/products/flash-deals
 * Get ONLY active limited time flash deals with a countdown timer (flashDealEnd)
 */
export const getFlashDealsProducts = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null
  const wishlistIds = await getWishlistProductIds(userId)
  const cartProductMap = await getCartProductMap(userId)

  const pincode = req.query.pincode
  const latitude = req.query.latitude ? parseFloat(req.query.latitude) : undefined
  const longitude = req.query.longitude ? parseFloat(req.query.longitude) : undefined

  const page = req.query.page ? parseInt(req.query.page, 10) : 1
  const limit = Math.min(
    req.query.limit ? parseInt(req.query.limit, 10) : DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  )

  const { warehouse, reason } = await selectWarehouse(pincode, latitude, longitude)

  if (!warehouse) {
    return successResponse(
      res,
      200,
      {
        serviceable: false,
        warehouse: null,
        products: [],
        total: 0,
        reason
      },
      'Pincode not serviceable'
    )
  }

  const skip = (page - 1) * limit

  const baseWhere = {
    warehouseId: warehouse.id,
    isActive: true,
    status: 'APPROVED',
    stock: { gt: 0 },
    flashDealEnd: {
      gt: new Date()
    }
  }

  const where = buildProductWhereClause(baseWhere, req.query)

  const allProducts = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
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
      status: true,
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
      tags: true,
      flashDealEnd: true,
      ...variantsInclude
    },
    orderBy: {
      flashDealEnd: 'asc'
    }
  })

  await resolveProductPrices(allProducts, req.query.channel || 'ONLINE')

  const total = allProducts.length
  const paginatedProducts = allProducts.slice(skip, skip + limit)

  let formattedProducts = await Promise.all(
    paginatedProducts.map(async product => {
      const formatted = await formatProduct(product)
      return {
        ...formatted,
        cartItemCount: cartProductMap[product.id] || 0
      }
    })
  )

  formattedProducts = attachWishlistFlag(formattedProducts, wishlistIds, userId)
  const totalPages = Math.ceil(total / limit)

  return res.status(200).json({
    success: true,
    data: {
      serviceable: true,
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        pincodeList: warehouse.servicePincodes
      },
      products: formattedProducts,
      total,
      page,
      limit,
      totalPages,
      reason
    },
    message: req.t ? req.t("PRODUCT_FETCHED") : "Flash deals fetched successfully"
  })
})

/**
 * GET /api/v1/products/weekly-specials
 * Get weekly special products
 */
export const getWeeklySpecialsProducts = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null
  const wishlistIds = await getWishlistProductIds(userId)
  const cartProductMap = await getCartProductMap(userId)

  const pincode = req.query.pincode
  const latitude = req.query.latitude ? parseFloat(req.query.latitude) : undefined
  const longitude = req.query.longitude ? parseFloat(req.query.longitude) : undefined

  const page = req.query.page ? parseInt(req.query.page, 10) : 1
  const limit = Math.min(
    req.query.limit ? parseInt(req.query.limit, 10) : DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  )

  const { warehouse, reason } = await selectWarehouse(pincode, latitude, longitude)

  if (!warehouse) {
    return successResponse(
      res,
      200,
      {
        serviceable: false,
        warehouse: null,
        products: [],
        total: 0,
        reason
      },
      'Pincode not serviceable'
    )
  }

  const skip = (page - 1) * limit

  const baseWhere = {
    warehouseId: warehouse.id,
    isActive: true,
    status: 'APPROVED',
    stock: { gt: 0 }
  }

  const where = buildProductWhereClause(baseWhere, req.query)

  const allProducts = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
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
      status: true,
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
      tags: true,
      flashDealEnd: true,
      ...variantsInclude
    }
  })

  await resolveProductPrices(allProducts, req.query.channel || 'ONLINE')

  const weeklySpecials = allProducts.filter(product => {
    const isFlashExpired = product.flashDealEnd && new Date(product.flashDealEnd) <= new Date()
    if (isFlashExpired) return false

    const hasTag = product.tags && product.tags.some(tag => 
      ['weekly', 'weekly-special', 'weekly-specials', 'weekly-deals', 'special'].includes(tag.toLowerCase())
    )
    return hasTag
  })

  weeklySpecials.sort((a, b) => {
    const hasTagA = a.tags && a.tags.some(tag => ['weekly', 'weekly-special', 'weekly-specials', 'weekly-deals', 'special'].includes(tag.toLowerCase())) ? 1 : 0
    const hasTagB = b.tags && b.tags.some(tag => ['weekly', 'weekly-special', 'weekly-specials', 'weekly-deals', 'special'].includes(tag.toLowerCase())) ? 1 : 0
    if (hasTagB !== hasTagA) return hasTagB - hasTagA

    const priceA = getProductFinalPrice(a)
    const priceB = getProductFinalPrice(b)
    const discountA = a.mrp ? ((Number(a.mrp) - Number(priceA)) / Number(a.mrp)) * 100 : 0
    const discountB = b.mrp ? ((Number(b.mrp) - Number(priceB)) / Number(b.mrp)) * 100 : 0
    return discountB - discountA
  })

  const total = weeklySpecials.length
  const paginatedProducts = weeklySpecials.slice(skip, skip + limit)

  let formattedProducts = await Promise.all(
    paginatedProducts.map(async product => {
      const formatted = await formatProduct(product)
      return {
        ...formatted,
        cartItemCount: cartProductMap[product.id] || 0
      }
    })
  )

  formattedProducts = attachWishlistFlag(formattedProducts, wishlistIds, userId)
  const totalPages = Math.ceil(total / limit)

  return res.status(200).json({
    success: true,
    data: {
      serviceable: true,
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        pincodeList: warehouse.servicePincodes
      },
      products: formattedProducts,
      total,
      page,
      limit,
      totalPages,
      reason
    },
    message: req.t ? req.t("PRODUCT_FETCHED") : "Weekly specials fetched successfully"
  })
})