import { prisma } from '../config/prismaClient.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { PriceResolverService } from '../services/priceResolverService.js';
import logger from '../utils/logger.js';
import { isValidUUID } from '../utils/uuidValidator.js';
import { errorResponse, successResponse } from '../utils/responseHelper.js';
import { mapVariants, variantsInclude } from '../utils/variantHelper.js';

const unitCache = {};
const unitTypeCache = {};

async function resolveUnitValue(value) {
  if (!value) return value;
  if (!isValidUUID(value)) return value;
  if (unitCache[value] !== undefined) return unitCache[value];

  const unit = await prisma.unit.findUnique({
    where: { id: value },
    select: { name: true, shortCode: true }
  });

  const result = unit?.name || value;
  unitCache[value] = result;
  return result;
}

async function resolveUnitTypeValue(value) {
  if (!value) return value;
  if (!isValidUUID(value)) return value;
  if (unitTypeCache[value] !== undefined) return unitTypeCache[value];

  const unitType = await prisma.unitType.findUnique({
    where: { id: value },
    select: { name: true }
  });

  const result = unitType?.name || value;
  unitTypeCache[value] = result;
  return result;
}

async function normalizeProductUnitFields(product) {
  if (!product) return product;

  const normalizedProduct = {
    ...product,
    unit: await resolveUnitValue(product.unit),
    unitType: await resolveUnitTypeValue(product.unitType)
  };

  if (Array.isArray(product.variants)) {
    normalizedProduct.variants = await Promise.all(
      product.variants.map(async (variant) => ({
        ...variant,
        unit: await resolveUnitValue(variant.unit),
        unitType: await resolveUnitTypeValue(variant.unitType)
      }))
    );
  }

  return normalizedProduct;
}

async function getProductRating(productId) {
  try {
    const result = await prisma.rating.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true }
    });

    return {
      average: result._avg.rating || 0,
      count: result._count.rating || 0
    };
  } catch (error) {
    logger.error('[Wishlist] Error calculating rating', { error: error.message });
    return { average: 0, count: 0 };
  }
}

function calculateSavedAmount(mrp, sellingAmount) {
  const mrpValue = Number(mrp || 0);
  const sellingValue = Number(sellingAmount || 0);
  return mrpValue > sellingValue ? mrpValue - sellingValue : 0;
}

function getProductFinalPrice(product) {
  return product?.finalPrice ?? product?.price ?? 0;
}

function getVariantSellingPrice(variant) {
  return variant?.sellingPrice ?? variant?.price ?? 0;
}

function buildBaseVariant(product, discount) {
  const productFinalPrice = getProductFinalPrice(product);
  const stockQty = product.stock != null ? Math.max(0, parseInt(product.stock, 10) || 0) : 0;
  const inStock = stockQty > 0;
  const isOutOfStock = !inStock;
  const isAvailable = inStock && product.isActive !== false && product.status === 'APPROVED';
  const status = isOutOfStock ? 'OUT_OF_STOCK' : 'ACTIVE';

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
  };
}

async function formatProduct(product) {
  product = await normalizeProductUnitFields(product);

  const rating = await getProductRating(product.id);
  const productFinalPrice = getProductFinalPrice(product);
  const stockQty = product.stock != null ? Math.max(0, parseInt(product.stock, 10) || 0) : 0;
  const inStock = stockQty > 0;
  const isOutOfStock = !inStock;
  const isAvailable = inStock && product.isActive !== false && product.status === 'APPROVED';

  const discount =
    product.mrp && Number(product.mrp) > Number(productFinalPrice)
      ? Math.round(
          ((Number(product.mrp) - Number(productFinalPrice)) / Number(product.mrp)) * 100
        )
      : 0;

  const mappedVariants = (mapVariants(product.variants || []) || []).map((variant) => {
    const variantSellingPrice = getVariantSellingPrice(variant);
    const vStock = variant.stockQuantity != null ? Math.max(0, parseInt(variant.stockQuantity, 10) || 0) : (variant.stock != null ? Math.max(0, parseInt(variant.stock, 10) || 0) : 0);
    const vInStock = vStock > 0;
    const vIsOutOfStock = !vInStock;
    const vIsAvailable = vInStock && variant.isEnabled !== false && variant.status !== 'INACTIVE';
    const vStatus = vIsOutOfStock ? 'OUT_OF_STOCK' : (variant.status || 'ACTIVE');

    return {
      ...variant,
      price: variantSellingPrice,
      sellingPrice: variantSellingPrice,
      finalPrice: variantSellingPrice,
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
    };
  });

  const inStockMappedVariants = mappedVariants.filter(
    (v) => (v.stockQuantity ?? v.stock ?? 0) > 0
  );

  const variants = [];
  if (stockQty > 0 && inStockMappedVariants.length > 0) {
    variants.push(buildBaseVariant(product, discount));
  }
  variants.push(...inStockMappedVariants);

  const hasVariants = variants.length > 0;
  const totalVariantsStock = hasVariants
    ? variants.reduce((sum, v) => sum + (v.stock || 0), 0)
    : stockQty;
  const allVariantsOutOfStock = hasVariants
    ? variants.every((v) => (v.stock || 0) <= 0)
    : isOutOfStock;

  let effectivePrice = productFinalPrice;
  let effectiveFinalPrice = productFinalPrice;
  let effectiveMrp = product.mrp;
  let effectiveUnit = product.unit;
  let effectiveUnitType = product.unitType || null;
  let effectiveMeasurement = product.measurement || null;
  let effectiveStock = stockQty;
  let effectiveInStock = inStock;
  let effectiveIsOutOfStock = isOutOfStock;

  if (stockQty <= 0 && inStockMappedVariants.length > 0) {
    const firstAvail = inStockMappedVariants[0];
    effectivePrice = firstAvail.price;
    effectiveFinalPrice = firstAvail.sellingPrice || firstAvail.price;
    effectiveMrp = firstAvail.mrp;
    effectiveUnit = firstAvail.unit;
    effectiveUnitType = firstAvail.unitType || effectiveUnitType;
    effectiveMeasurement = firstAvail.measurement || effectiveMeasurement;
    effectiveStock = firstAvail.stock;
    effectiveInStock = true;
    effectiveIsOutOfStock = false;
  }

  const effectiveDiscount =
    effectiveMrp && Number(effectiveMrp) > Number(effectiveFinalPrice)
      ? Math.round(
          ((Number(effectiveMrp) - Number(effectiveFinalPrice)) / Number(effectiveMrp)) * 100
        )
      : 0;

  const effectiveSavedAmount = calculateSavedAmount(effectiveMrp, effectiveFinalPrice);

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    shortDescription: product.shortDescription || null,

    // Product price is now strictly sellingPrice / finalPrice
    price: effectivePrice,
    finalPrice: effectiveFinalPrice,
    sellingPrice: effectiveFinalPrice,
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
          image: product.brand.image || null
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
          name: product.subCategory.name
        }
      : null,
    variants: variants,
    hasVariants: hasVariants,
    rating: rating.average,
    reviewsCount: rating.count,
    isWishlistAdded: true
  };
}

// Helper to populate product and warehouse info with full price resolution & formatting
const populateItems = async (items, channel = 'ONLINE') => {
  const resolvedList = await Promise.all(
    items.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: {
          id: true,
          name: true,
          description: true,
          shortDescription: true,
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
          status: true,
          warehouseId: true,
          isFeatured: true,
          brand: {
            select: { id: true, name: true, image: true }
          },
          category: {
            select: { id: true, name: true }
          },
          subCategory: {
            select: { id: true, name: true }
          },
          ...variantsInclude
        }
      });

      if (!product) {
        return null;
      }

      const warehouse = item.warehouseId
        ? await prisma.warehouse.findUnique({
            where: { id: item.warehouseId },
            select: { id: true, name: true, code: true, address: true }
          })
        : null;

      const wId = item.warehouseId || product.warehouseId;
      const cleanChannel = (channel || 'ONLINE').toUpperCase();
      const targetChannel = wId && ['ONLINE', 'VEHICLE', 'POS'].includes(cleanChannel)
        ? `${cleanChannel}_${wId}`
        : channel;

      const resolved = await PriceResolverService.resolvePrice({
        productId: product.id,
        channel: targetChannel
      });
      product.price = resolved.sellingPrice;
      product.mrp = resolved.mrp;
      product.finalPrice = resolved.sellingPrice;

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
            variant.finalPrice = resolvedVariant.sellingPrice;
          })
        );
      }

      const formattedProduct = await formatProduct(product);

      return {
        ...item,
        product: formattedProduct,
        warehouse
      };
    })
  );

  return resolvedList.filter(Boolean);
};

// ============================================================
// GET WISHLIST (ACTIVE ITEMS ONLY)
// ============================================================
export const getWishlist = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const channel = req.query.channel || 'ONLINE';

  logger.info('[Wishlist] Fetching wishlist', { userId });

  const wishlist = await prisma.wishlist.findUnique({
    where: { userId },
    select: {
      items: true,
    },
  });

  if (!wishlist || !wishlist.items?.length) {
    return successResponse(
      res,
      200,
      { items: [] },
      'Wishlist fetched successfully'
    );
  }

  const activeItems = wishlist.items.filter(
    (item) => item.status === 'ACTIVE'
  );

  const populatedItems = await populateItems(activeItems, channel);

  return successResponse(
    res,
    200,
    { items: populatedItems },
    'Wishlist fetched successfully'
  );
});


// ============================================================
// ADD SINGLE ITEM
// ============================================================
export const addToWishlist = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { warehouseId, productId } = req.body;
  const channel = req.query.channel || 'ONLINE';

  logger.info('[Wishlist] Adding item', { userId, warehouseId, productId });

  const productExists = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true }
  });

  if (!productExists) {
    return errorResponse(res, 404, 'Product not found');
  }

  let wishlist = await prisma.wishlist.findUnique({ where: { userId } });

  const newItem = {
    warehouseId,
    productId,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (!wishlist) {
    wishlist = await prisma.wishlist.create({ data: { userId, items: [newItem] } });
    const populatedItems = await populateItems(wishlist.items.filter(item => item.status === 'ACTIVE'), channel);
    return successResponse(res, 201, { ...wishlist, items: populatedItems }, 'Item added to wishlist');
  }

  const activeExisting = (wishlist.items || []).find((item) => item.productId === productId && item.status === 'ACTIVE');
  if (activeExisting) return errorResponse(res, 400, 'Item already in wishlist');

  const prevIndex = (wishlist.items || []).findIndex(item => item.productId === productId);
  let updatedItemsList;
  if (prevIndex !== -1) {
    updatedItemsList = wishlist.items.map((item, idx) =>
      idx === prevIndex
        ? { ...item, status: 'ACTIVE', warehouseId: warehouseId || item.warehouseId, updatedAt: new Date() }
        : item
    );
  } else {
    updatedItemsList = [...(wishlist.items || []), newItem];
  }

  const updatedWishlist = await prisma.wishlist.update({
    where: { userId },
    data: { items: updatedItemsList },
  });

  const activeItems = (updatedWishlist.items || []).filter((item) => item.status === 'ACTIVE');
  const populatedItems = await populateItems(activeItems, channel);
  return successResponse(res, 200, { ...updatedWishlist, items: populatedItems }, 'Item added to wishlist');
});

// ============================================================
// REMOVE ITEM (SOFT DELETE → status = REMOVED)
// ============================================================
export const removeFromWishlist = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { productId } = req.params;
  const channel = req.query.channel || 'ONLINE';

  logger.info('[Wishlist] Removing item', { userId, productId });

  let wishlist = await prisma.wishlist.findUnique({ where: { userId } });
  if (!wishlist) return errorResponse(res, 404, 'Wishlist not found');

  const updatedItems = (wishlist.items || []).map((item) =>
    item.productId === productId
      ? { ...item, status: 'REMOVED', updatedAt: new Date() }
      : item
  );

  const updatedWishlist = await prisma.wishlist.update({
    where: { userId },
    data: { items: updatedItems },
  });

  const activeItems = (updatedWishlist.items || []).filter((item) => item.status === 'ACTIVE');
  const populatedItems = await populateItems(activeItems, channel);
  return successResponse(res, 200, { ...updatedWishlist, items: populatedItems }, 'Item removed from wishlist');
});

// ============================================================
// RESTORE REMOVED ITEM
// ============================================================
export const restoreWishlistItem = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { productId } = req.params;
  const channel = req.query.channel || 'ONLINE';

  logger.info('[Wishlist] Restoring item', { userId, productId });

  let wishlist = await prisma.wishlist.findUnique({ where: { userId } });
  if (!wishlist) return errorResponse(res, 404, 'Wishlist not found');

  const updatedItems = (wishlist.items || []).map((item) =>
    item.productId === productId && item.status === 'REMOVED'
      ? { ...item, status: 'ACTIVE', updatedAt: new Date() }
      : item
  );

  const updatedWishlist = await prisma.wishlist.update({
    where: { userId },
    data: { items: updatedItems },
  });

  const activeItems = (updatedWishlist.items || []).filter((item) => item.status === 'ACTIVE');
  const populatedItems = await populateItems(activeItems, channel);
  return successResponse(res, 200, { ...updatedWishlist, items: populatedItems }, 'Wishlist item restored');
});

// ============================================================
// UPDATE ITEM
// ============================================================
export const updateWishlistItem = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { productId } = req.params;
  const { warehouseId, status } = req.body;
  const channel = req.query.channel || 'ONLINE';

  logger.info('[Wishlist] Updating item', { userId, productId });

  let wishlist = await prisma.wishlist.findUnique({ where: { userId } });
  if (!wishlist) return errorResponse(res, 404, 'Wishlist not found');

  const updatedItems = (wishlist.items || []).map((item) =>
    item.productId === productId
      ? {
          ...item,
          warehouseId: warehouseId ?? item.warehouseId,
          status: status ?? item.status,
          updatedAt: new Date(),
        }
      : item
  );

  const updatedWishlist = await prisma.wishlist.update({
    where: { userId },
    data: { items: updatedItems },
  });

  const activeItems = (updatedWishlist.items || []).filter((item) => item.status === 'ACTIVE');
  const populatedItems = await populateItems(activeItems, channel);
  return successResponse(res, 200, { ...updatedWishlist, items: populatedItems }, 'Wishlist item updated');
});

// ============================================================
// CLEAR WISHLIST (SOFT DELETE ALL ITEMS)
// ============================================================
export const clearWishlist = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const channel = req.query.channel || 'ONLINE';

  logger.info('[Wishlist] Clearing wishlist (soft)', { userId });

  const wishlist = await prisma.wishlist.findUnique({ where: { userId } });
  if (!wishlist) return errorResponse(res, 404, 'Wishlist not found');

  const updatedItems = (wishlist.items || []).map((item) => ({
    ...item,
    status: 'INACTIVE',
    updatedAt: new Date(),
  }));

  const updatedWishlist = await prisma.wishlist.update({
    where: { userId },
    data: { items: updatedItems, updatedAt: new Date() },
  });

  return successResponse(res, 200, { ...updatedWishlist, items: [] }, 'Wishlist cleared successfully');
});
