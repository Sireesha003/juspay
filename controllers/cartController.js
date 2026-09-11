// controllers/cartController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import { PriceResolverService } from '../services/priceResolverService.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { getStateCode } from '../utils/taxUtils.js'
import {
  calculateDeliveryDistance,
  calculateFastDeliveryETA
} from '../utils/distanceUtils.js'
import { getAvailableDeliveryTypes } from '../utils/deliveryTypeUtils.js'
import { DEFAULT_GST_RATE } from '../utils/taxUtils.js'
import { calculateCouponDiscount } from '../utils/couponTypeUtils.js'
import {
  normalizeWarehouseId,
  logCartWarehouseMismatch
} from '../utils/cartWarehouseUtils.js'
import { validateAndSanitizeCart } from '../utils/cartSanitization.js'

async function resolveCartPricing(cart, channel = 'ONLINE') {
  if (!cart || !cart.items) return cart;

  const bundleIds = [...new Set(cart.items.filter(i => i.bundleId).map(i => i.bundleId))];
  const bundles = bundleIds.length > 0 ? await prisma.bundle.findMany({ where: { id: { in: bundleIds } } }) : [];
  const bundleMap = Object.fromEntries(bundles.map(b => [b.id, b]));

  // Calculate original total for each bundle in the cart to calculate prorata
  const bundleOriginalTotals = {};
  for (const item of cart.items) {
    if (item.bundleId && bundleMap[item.bundleId]) {
      const wId = item.product?.warehouseId || cart.warehouseId;
      const cleanChannel = (channel || 'ONLINE').toUpperCase();
      const targetChannel = wId && ['ONLINE', 'VEHICLE', 'POS'].includes(cleanChannel)
        ? `${cleanChannel}_${wId}`
        : channel;

      const resolved = await PriceResolverService.resolvePrice({
        productId: item.product.id,
        productVariantId: item.productVariant?.id || null,
        channel: targetChannel,
        quantity: item.quantity
      });
      bundleOriginalTotals[item.bundleId] = (bundleOriginalTotals[item.bundleId] || 0) + (resolved.sellingPrice * item.quantity);
    }
  }

  for (const item of cart.items) {
    if (item.product) {
      const wId = item.product.warehouseId || cart.warehouseId;
      const cleanChannel = (channel || 'ONLINE').toUpperCase();
      const targetChannel = wId && ['ONLINE', 'VEHICLE', 'POS'].includes(cleanChannel)
        ? `${cleanChannel}_${wId}`
        : channel;

      const resolvedProduct = await PriceResolverService.resolvePrice({
        productId: item.product.id,
        channel: targetChannel,
        quantity: item.quantity
      });

      let sellingPrice = resolvedProduct.sellingPrice;
      let mrp = resolvedProduct.mrp;

      if (item.bundleId && bundleMap[item.bundleId]) {
        const bundle = bundleMap[item.bundleId];
        const originalTotal = bundleOriginalTotals[item.bundleId] || 1;
        const ratio = (resolvedProduct.sellingPrice * item.quantity) / originalTotal;
        sellingPrice = (bundle.bundlePrice * ratio) / item.quantity;
      }

      item.product.price = sellingPrice;
      item.product.mrp = mrp;
      item.product.finalPrice = sellingPrice;

      if (item.productVariant) {
        const resolvedVariant = await PriceResolverService.resolvePrice({
          productId: item.product.id,
          productVariantId: item.productVariant.id,
          channel: targetChannel,
          quantity: item.quantity
        });
        
        let variantSellingPrice = resolvedVariant.sellingPrice;
        if (item.bundleId && bundleMap[item.bundleId]) {
          const bundle = bundleMap[item.bundleId];
          const originalTotal = bundleOriginalTotals[item.bundleId] || 1;
          const ratio = (resolvedVariant.sellingPrice * item.quantity) / originalTotal;
          variantSellingPrice = (bundle.bundlePrice * ratio) / item.quantity;
        }

        item.productVariant.sellingPrice = variantSellingPrice;
        item.productVariant.mrp = resolvedVariant.mrp;
        item.productVariant.price = variantSellingPrice;
        item.productVariant.finalPrice = variantSellingPrice;
      }
    }
  }
  return cart;
}

async function handleAddBundleToCart(req, res, userId, bundleId, quantity, type) {
  const channel = req.query.channel || 'ONLINE';
  
  const bundle = await prisma.bundle.findUnique({
    where: { id: bundleId },
    include: {
      items: {
        include: {
          product: true,
          productVariant: true
        }
      }
    }
  });

  if (!bundle || !['ACTIVE', 'APPROVED'].includes(bundle.status) || !bundle.isActive) {
    return errorResponse(res, 400, 'Bundle is not available or not active');
  }

  const now = new Date();
  const rawItems = bundle.items || [];
  if (rawItems.length === 0) {
    return errorResponse(res, 400, 'Bundle contains no items');
  }

  const hasExpiredItem = rawItems.some(
    item => item.product?.flashDealEnd && new Date(item.product.flashDealEnd) <= now
  );

  if (hasExpiredItem) {
    return errorResponse(res, 400, 'Bundle deal has expired or contains expired deal items');
  }

  const approvedItems = rawItems.filter(item => {
    const isProdApproved = item.product && item.product.isActive && item.product.status === 'APPROVED';
    const isNotExpired = !item.product?.flashDealEnd || new Date(item.product.flashDealEnd) > now;
    const isVariantValid = !item.productVariant || (item.productVariant.isEnabled && item.productVariant.status === 'ACTIVE');
    return isProdApproved && isNotExpired && isVariantValid;
  });

  if (approvedItems.length === 0 || approvedItems.length < rawItems.length) {
    return errorResponse(res, 400, 'Bundle deal is unavailable or contains inactive/unapproved products');
  }

  const warehouseId = approvedItems[0]?.product?.warehouseId || req.normalizedWarehouseId;
  const cart = await getOrCreateCart(userId, warehouseId, true, channel);

  if (type === 'inc') {
    for (const item of approvedItems) {
      const existing = await prisma.cartItem.findFirst({
        where: { cartId: cart.id, bundleId, productId: item.productId, productVariantId: item.productVariantId }
      });
      if (existing) {
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + (item.quantity * quantity) }
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            bundleId,
            productId: item.productId,
            productVariantId: item.productVariantId,
            quantity: item.quantity * quantity
          }
        });
      }
    }
  } else if (type === 'dec') {
    for (const item of approvedItems) {
      const existing = await prisma.cartItem.findFirst({
        where: { cartId: cart.id, bundleId, productId: item.productId, productVariantId: item.productVariantId }
      });
      if (existing) {
        const newQty = existing.quantity - (item.quantity * quantity);
        if (newQty <= 0) {
          await prisma.cartItem.delete({ where: { id: existing.id } });
        } else {
          await prisma.cartItem.update({
            where: { id: existing.id },
            data: { quantity: newQty }
          });
        }
      }
    }
  }

  const { cart: updatedCart } = await loadCartAndPrune(userId, warehouseId, channel);
  return successResponse(res, 200, { cart: updatedCart }, 'Bundle added to cart');
}

/**
 * Load cart for warehouse; remove lines that are inactive, wrong warehouse, or unavailable variant.
 * Keeps cart totals aligned with checkout validation.
 */
async function loadCartAndPrune(userId, warehouseId, channel = 'ONLINE') {
  let cart = await getOrCreateCart(userId, warehouseId, false, channel)
  if (!cart) return { cart: null, removedInvalidCount: 0 }

  const sanitation = await validateAndSanitizeCart(prisma, cart, warehouseId, {
    resetCartMetaWhenEmpty: true
  })

  if (sanitation.removedInvalidCount > 0) {
    logger.warn(
      '[Cart] Removed invalid cart lines (inactive, warehouse mismatch, or bad variant)',
      {
        userId,
        warehouseId,
        count: sanitation.removedInvalidCount,
        reasons: sanitation.invalidReasons
      }
    )
  }

  if (sanitation.removedInvalidCount === 0) {
    return { cart, removedInvalidCount: 0 }
  }

  cart = await getOrCreateCart(userId, warehouseId, false, channel)
  return { cart, removedInvalidCount: sanitation.removedInvalidCount }
}

function calculateSavedAmount(mrp, price) {
  return mrp && Number(mrp) > Number(price) ? Number(mrp) - Number(price) : 0
}

/**
 * Product price should be same as product controller:
 * finalPrice first, fallback to price.
 */
function getProductCartPrice(product) {
  return product?.finalPrice != null
    ? Number(product.finalPrice)
    : Number(product?.price || 0)
}

/**
 * If productVariantId is same as productId or empty, treat it as base product selection.
 */
function normalizeVariantSelection(productId, productVariantId) {
  if (
    productVariantId === undefined ||
    productVariantId === null ||
    productVariantId === '' ||
    productVariantId === productId
  ) {
    return null
  }

  return productVariantId
}

/**
 * Get effective unit price, stock, tax rate, and display fields for a cart item.
 * Variant uses variant sellingPrice.
 * Base product uses product finalPrice.
 */
function getEffectiveItemPricing(item) {
  const product = item.product
  const variant = item.productVariant

  if (variant && variant.isEnabled && variant.status === 'ACTIVE') {
    const unitPrice =
      variant.sellingPrice != null
        ? Number(variant.sellingPrice)
        : (variant.mrp != null ? Number(variant.mrp) : getProductCartPrice(product))

    return {
      unitPrice,
      stock: variant.stockQuantity ?? 0,
      taxRate: product?.taxRate != null ? product.taxRate : DEFAULT_GST_RATE,
      mrp: variant.mrp ?? product?.mrp,
      unit: variant.unit || product?.unit,
      measurement: variant.measurement || product?.measurement || null,
      variantName: variant.variantName,
      sku: variant.sku,
      images: variant.primaryImages?.length
        ? variant.primaryImages
        : product?.images,
      fromVariant: true
    }
  }

  const productFinalPrice = getProductCartPrice(product)

  return {
    unitPrice: productFinalPrice,
    stock: product?.stock ?? 0,
    taxRate: product?.taxRate != null ? product.taxRate : DEFAULT_GST_RATE,
    mrp: product?.mrp,
    unit: product?.unit,
    measurement: product?.measurement || null,
    variantName: null,
    sku: product?.sku,
    images: product?.images,
    fromVariant: false
  }
}

/**
 * Get warehouse for tax calculation
 */
async function getWarehouseForCart(cartItems) {
  if (!cartItems || cartItems.length === 0) return null

  const warehouseId = cartItems[0].product?.warehouseId
  if (!warehouseId) return null

  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, state: true, address: true, location: true }
    })
    return warehouse
  } catch (error) {
    logger.warn('[Cart] Error fetching warehouse', {
      error: error.message,
      warehouseId
    })
    return null
  }
}

/**
 * Common cart select.
 */
const cartSelect = {
  id: true,
  userId: true,
  warehouseId: true,
  appliedCouponId: true,
  appliedCouponCode: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      productVariantId: true,
      quantity: true,
      snapshotPrice: true,
      priceUpdatedAt: true,
      addedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          price: true,
          finalPrice: true,
          mrp: true,
          taxRate: true,
          images: true,
          unit: true,
          measurement: true,
          stock: true,
          sku: true,
          isActive: true,
          status: true,
          warehouseId: true,
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
          }
        }
      },
      productVariant: {
        select: {
          id: true,
          variantName: true,
          sku: true,
          unit: true,
          unitType: true,
          measurement: true,
          sellingPrice: true,
          mrp: true,
          stockQuantity: true,
          minOrderQty: true,
          maxOrderQty: true,
          status: true,
          isEnabled: true,
          primaryImages: true
        }
      }
    },
    orderBy: {
      addedAt: 'desc'
    }
  }
}

/**
 * Get or create cart for user
 */
async function getOrCreateCart(userId, warehouseId, createIfMissing = true, channel = 'ONLINE') {
  let cart = await prisma.cart.findFirst({
    where: { userId, warehouseId },
    select: cartSelect
  })

  if (!cart && createIfMissing) {
    cart = await prisma.cart.create({
      data: {
        userId,
        warehouseId
      },
      select: cartSelect
    })
  }

  if (cart) {
    await resolveCartPricing(cart, channel)
  }

  return cart
}

/**
 * Calculate cart totals including tax
 */
async function calculateCartTotals(
  cartItems,
  coupon = null,
  deliveryAddress = null,
  warehouse = null
) {
  let subtotal = 0
  let itemCount = 0
  let warehouseId = null

  for (const item of cartItems) {
    if (!item.product?.isActive || item.product?.status !== 'APPROVED') continue

    const effective = getEffectiveItemPricing(item)

    if (
      item.productVariant &&
      (!item.productVariant.isEnabled || item.productVariant.status !== 'ACTIVE')
    ) {
      continue
    }

    const availableQuantity = Math.min(item.quantity, effective.stock)
    if (availableQuantity === 0) continue

    const whId = item.product.warehouseId
    if (warehouseId === null) {
      warehouseId = whId
    } else if (whId && warehouseId !== whId) {
      logger.warn('[Cart] Mixed warehouse items detected', {
        warehouseId1: warehouseId,
        warehouseId2: whId
      })
    }

    const itemTotal = effective.unitPrice * availableQuantity
    subtotal += itemTotal
    itemCount += availableQuantity
  }

  subtotal = Math.round(subtotal * 100) / 100

  let discount = 0
  if (coupon) {
    discount = calculateCouponDiscount(coupon, subtotal)
  }

  const taxableAmount = Math.round((subtotal - discount) * 100) / 100

  const deliveryState = deliveryAddress ? getStateCode(deliveryAddress) : null
  const warehouseState = warehouse ? warehouse.state || null : null

  let totalWeightedTax = 0
  let totalPrice = 0
  let avgTaxRate = DEFAULT_GST_RATE

  for (const item of cartItems) {
    if (!item.product?.isActive || item.product?.status !== 'APPROVED') continue

    if (
      item.productVariant &&
      (!item.productVariant.isEnabled || item.productVariant.status !== 'ACTIVE')
    ) {
      continue
    }

    const effective = getEffectiveItemPricing(item)
    const availableQuantity = Math.min(item.quantity, effective.stock)
    if (availableQuantity === 0) continue

    const itemPrice = effective.unitPrice * availableQuantity
    totalPrice += itemPrice
    totalWeightedTax += itemPrice * effective.taxRate
  }

  if (totalPrice > 0) {
    avgTaxRate = totalWeightedTax / totalPrice
  }

  const { calculateTaxAfterDiscount } = await import('../utils/taxUtils.js')
  const taxBreakdown = calculateTaxAfterDiscount(
    subtotal,
    discount,
    deliveryState,
    warehouseState,
    avgTaxRate
  )

  const total = Math.round((taxableAmount + taxBreakdown.totalTax) * 100) / 100

  let deliveryCharge = 0
  if (warehouseId) {
    try {
      const { getCartDeliveryCharge } = await import(
        '../utils/deliveryChargeUtils.js'
      )

      const deliveryPincode = deliveryAddress?.pincode || null

      deliveryCharge = await getCartDeliveryCharge(
        total,
        warehouseId,
        deliveryPincode
      )
    } catch (error) {
      logger.error('[Cart] Error calculating delivery charge', {
        error: error.message,
        warehouseId
      })

      deliveryCharge = total >= 500 ? 0 : 50
    }
  }

  const totalWithDelivery = Math.round((total + deliveryCharge) * 100) / 100

  return {
    subtotal,
    itemCount,
    warehouseId,
    discount,
    taxableAmount,
    taxAmount: taxBreakdown.totalTax,
    cgst: taxBreakdown.cgst,
    sgst: taxBreakdown.sgst,
    igst: taxBreakdown.igst,
    deliveryCharge,
    total,
    totalWithDelivery
  }
}

/**
 * Update cart tax fields in database
 */
async function updateCartTaxFields(cartId, totals) {
  try {
    await prisma.cart.update({
      where: { id: cartId },
      data: {
        taxAmount: totals.taxAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        taxableAmount: totals.taxableAmount
      }
    })
  } catch (error) {
    logger.error('[Cart] Error updating cart tax fields', {
      error: error.message,
      cartId
    })
  }
}

/**
 * Format cart item for response
 */
function formatCartItem(item) {
  const product = item.product
  const effective = getEffectiveItemPricing(item)
  const unitPrice = effective.unitPrice
  const mrp = effective.mrp

  const discount =
    mrp && mrp > unitPrice
      ? Math.round(((mrp - unitPrice) / mrp) * 100)
      : 0

  const availableQuantity = Math.min(item.quantity, effective.stock)
  const isOutOfStock = effective.stock === 0
  const isLowStock = effective.stock < item.quantity
  const isVariantUnavailable =
    item.productVariant &&
    (!item.productVariant.isEnabled || item.productVariant.status !== 'ACTIVE')

  let priceChanged = false
  let priceDifference = 0
  let priceChangePercent = 0

  if (item.snapshotPrice != null && Number(item.snapshotPrice) !== Number(unitPrice)) {
    priceChanged = true
    priceDifference = unitPrice - Number(item.snapshotPrice)
    priceChangePercent = item.snapshotPrice
      ? (priceDifference / Number(item.snapshotPrice)) * 100
      : 0
  }

  const savings =
    mrp && mrp > unitPrice
      ? Math.round((mrp - unitPrice) * availableQuantity * 100) / 100
      : 0

  const savedAmount =
    mrp && mrp > unitPrice
      ? Math.round((mrp - unitPrice) * 100) / 100
      : 0

  const displayImages = effective.images?.length > 0 ? [effective.images[0]] : []

  return {
    id: item.id,
    productId: product.id,
    productVariantId: item.productVariantId ?? null,
    isValid: true,
    price: unitPrice,
    finalPrice: unitPrice,
    sellingPrice: unitPrice,
    mrp: mrp ?? product.mrp,
    unitPrice,
    unit: effective.unit || product.unit,
    measurement: effective.measurement || null,
    product: {
      id: product.id,
      name: product.name,

      // ✅ Same as product controller: finalPrice first
      price: unitPrice,
      finalPrice: unitPrice,
      sellingPrice: unitPrice,

      mrp: mrp ?? product.mrp,
      discount: discount > 0 ? discount : null,
      savedAmount: savedAmount > 0 ? savedAmount : null,
      images: displayImages,
      unit: effective.unit || product.unit,
      measurement: effective.measurement || null,
      stock: effective.stock,
      stockQuantity: effective.stock,
      inStock: effective.stock > 0 && !isVariantUnavailable,
      in_stock: effective.stock > 0 && !isVariantUnavailable,
      isOutOfStock: !(effective.stock > 0 && !isVariantUnavailable),
      is_out_of_stock: !(effective.stock > 0 && !isVariantUnavailable),
      outOfStock: !(effective.stock > 0 && !isVariantUnavailable),
      out_of_stock: !(effective.stock > 0 && !isVariantUnavailable),
      brand: product.brand
        ? { id: product.brand.id, name: product.brand.name }
        : null,
      category: product.category
        ? {
            id: product.category.id,
            name: product.category.name || 'Unnamed Category'
          }
        : null
    },
    variant: item.productVariant
      ? {
          id: item.productVariant.id,
          variantName: item.productVariant.variantName,
          sku: item.productVariant.sku,
          unit: item.productVariant.unit,
          unitType: item.productVariant.unitType,
          measurement: item.productVariant.measurement,
          price: unitPrice,
          finalPrice: unitPrice,
          sellingPrice: unitPrice,
          mrp: mrp ?? item.productVariant.mrp,
          status: item.productVariant.status,
          isEnabled: item.productVariant.isEnabled
        }
      : null,
    quantity: item.quantity,
    availableQuantity,
    isExcludedFromTotals: availableQuantity === 0,
    isOutOfStock: isOutOfStock || isVariantUnavailable,
    isLowStock,
    unitPrice,
    snapshotPrice: item.snapshotPrice,
    priceChanged,
    priceDifference: priceChanged
      ? Math.round(priceDifference * 100) / 100
      : 0,
    priceChangePercent: priceChanged
      ? Math.round(priceChangePercent * 100) / 100
      : 0,
    savings,
    totalPrice: Math.round(unitPrice * availableQuantity * 100) / 100,
    addedAt: item.addedAt
  }
}

/**
 * Format cart item with minimal fields for single item response
 */
function formatCartItemMinimal(item) {
  const product = item.product
  const effective = product ? getEffectiveItemPricing(item) : null

  if (!product) {
    return {
      id: item.id,
      productId: item.productId,
      productVariantId: item.productVariantId ?? null,
      quantity: item.quantity
    }
  }

  const unitPrice = effective?.unitPrice ?? getProductCartPrice(product)

  return {
    id: item.id,
    productId: product.id,
    productVariantId: item.productVariantId ?? null,
    quantity: item.quantity,
    totalPrice: Math.round(unitPrice * item.quantity * 100) / 100
  }
}

/**
 * GET /api/v1/cart
 */
export const getCart = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const requestedWarehouseId = req.normalizedWarehouseId
  const channel = req.query.channel || 'ONLINE'

  logger.info('[Cart] Fetching cart', {
    userId,
    warehouseId: requestedWarehouseId
  })

  const { cart, removedInvalidCount } = await loadCartAndPrune(
    userId,
    requestedWarehouseId,
    channel
  )

  const effectiveCartItems = cart?.items || []

  let coupon = null
  if (cart?.appliedCouponId) {
    coupon = await prisma.coupon.findUnique({
      where: { id: cart.appliedCouponId }
    })
  }

  let warehouse = null
  if (effectiveCartItems.length > 0 && effectiveCartItems[0].product.warehouseId) {
    warehouse = await prisma.warehouse.findUnique({
      where: { id: effectiveCartItems[0].product.warehouseId },
      select: { id: true, state: true, address: true, location: true }
    })
  }

  const totals = await calculateCartTotals(effectiveCartItems, coupon, null, warehouse)

  if (cart?.id) {
    await updateCartTaxFields(cart.id, totals)
  }

  const formattedItems = effectiveCartItems.map(formatCartItem)

  const response = {
    id: cart?.id || null,
    items: formattedItems,
    appliedCoupon: cart?.appliedCouponCode
      ? {
          code: cart.appliedCouponCode,
          discount: totals.discount
        }
      : null,
    summary: {
      itemCount: totals.itemCount,
      subtotal: totals.subtotal,
      deliveryCharge: 0,
      discount: totals.discount,
      taxAmount: totals.taxAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      taxableAmount: totals.taxableAmount,
      total: totals.total,
      warehouseId: totals.warehouseId
    },
    updatedAt: cart?.updatedAt || new Date(),
    cartHydration: {
      removedInvalidItemCount: removedInvalidCount,
      hadInvalidItemsRemoved: removedInvalidCount > 0
    }
  }

  logger.info('[Cart] Cart fetched successfully', {
    userId,
    warehouseId: requestedWarehouseId,
    itemCount: formattedItems.length,
    subtotal: totals.subtotal,
    removedInvalidCount
  })

  return successResponse(res, 200, response, 'Cart fetched successfully')
})

/**
 * POST /api/v1/cart/items
 */
export const addCartItem = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const {
    productId,
    productVariantId: rawProductVariantId,
    bundleId,
    quantity = 1,
    type = 'inc'
  } = req.body

  if (bundleId) {
    return handleAddBundleToCart(req, res, userId, bundleId, quantity, type);
  }

  const productVariantId = normalizeVariantSelection(
    productId,
    rawProductVariantId
  )

  logger.info('[Cart] Add/update cart item', {
    userId,
    productId,
    rawProductVariantId: rawProductVariantId ?? null,
    normalizedProductVariantId: productVariantId ?? null,
    bundleId: bundleId ?? null,
    quantity,
    type
  })

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
      stock: true,
      measurement: true,
      isActive: true,
      status: true,
      warehouseId: true
    }
  })

  if (!product) return errorResponse(res, 404, 'Product not found')
  if (!product.isActive) return errorResponse(res, 400, 'Product is not available')
  if (product.status !== 'APPROVED') {
    return errorResponse(res, 400, 'Product is not approved')
  }
  if (!product.warehouseId) {
    return errorResponse(res, 400, 'Product is not mapped to a warehouse')
  }

  const productWarehouseId = normalizeWarehouseId(product.warehouseId)

  if (req.normalizedWarehouseId !== productWarehouseId) {
    logCartWarehouseMismatch({
      userId,
      context: 'addCartItem',
      requestedWarehouseId: req.normalizedWarehouseId,
      actualWarehouseId: productWarehouseId
    })

    return errorResponse(res, 400, 'Warehouse mismatch for cart')
  }

  const channel = req.query.channel || 'ONLINE'
  const cleanChannel = channel.toUpperCase()
  const targetChannel = productWarehouseId && ['ONLINE', 'VEHICLE', 'POS'].includes(cleanChannel)
    ? `${cleanChannel}_${productWarehouseId}`
    : channel

  const resolved = await PriceResolverService.resolvePrice({
    productId: product.id,
    channel: targetChannel,
    quantity
  })
  product.price = resolved.sellingPrice
  product.mrp = resolved.mrp
  product.finalPrice = resolved.sellingPrice

  let unitPrice = getProductCartPrice(product)

  let maxStock = product.stock ?? 0
  let minQty = 1
  let maxQty = null
  let variant = null

  if (productVariantId) {
    variant = await prisma.productVariant.findFirst({
      where: {
        id: productVariantId,
        productId
      },
      select: {
        id: true,
        productId: true,
        variantName: true,
        sellingPrice: true,
        mrp: true,
        stockQuantity: true,
        minOrderQty: true,
        maxOrderQty: true,
        status: true,
        isEnabled: true
      }
    })

    if (!variant) {
      return errorResponse(
        res,
        404,
        'Product variant not found or does not belong to this product'
      )
    }

    if (variant.status !== 'ACTIVE') {
      return errorResponse(res, 400, 'This variant is not available')
    }

    if (!variant.isEnabled) {
      return errorResponse(res, 400, 'This variant is currently disabled')
    }

    const resolvedVariant = await PriceResolverService.resolvePrice({
      productId: product.id,
      productVariantId: variant.id,
      channel: targetChannel,
      quantity
    })

    variant.sellingPrice = resolvedVariant.sellingPrice
    variant.mrp = resolvedVariant.mrp
    unitPrice = resolvedVariant.sellingPrice

    maxStock = variant.stockQuantity ?? 0
    minQty = variant.minOrderQty ?? 1
    maxQty = variant.maxOrderQty ?? null
  }

  const cart = await getOrCreateCart(userId, product.warehouseId, true, channel)

  const existingCartItem = productVariantId
    ? await prisma.cartItem.findUnique({
        where: {
          cartId_productId_productVariantId: {
            cartId: cart.id,
            productId,
            productVariantId
          }
        }
      })
    : await prisma.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId,
          productVariantId: null
        }
      })

  let newQuantity

  if (existingCartItem) {
    if (type === 'inc') {
      newQuantity = existingCartItem.quantity + quantity

      if (newQuantity > maxStock) {
        return errorResponse(
          res,
          400,
          `Only ${maxStock} units available in stock${
            variant ? ` for ${variant.variantName}` : ''
          }`
        )
      }

      if (maxQty != null && newQuantity > maxQty) {
        return errorResponse(
          res,
          400,
          `Maximum order quantity${variant ? ' for this variant' : ''} is ${maxQty}`
        )
      }
    }

    if (type === 'dec') {
      newQuantity = existingCartItem.quantity - quantity

      if (quantity > existingCartItem.quantity) {
        await prisma.cartItem.delete({ where: { id: existingCartItem.id } })

        logger.info('[Cart] Decrement exceeded cart quantity, item removed', {
          userId,
          productId,
          productVariantId: productVariantId ?? null
        })

        return sendUpdatedCartResponse(
          res,
          cart.id,
          userId,
          `Item removed from cart. You had ${existingCartItem.quantity} in cart.`,
          productWarehouseId,
          channel
        )
      }

      if (newQuantity <= 0) {
        await prisma.cartItem.delete({ where: { id: existingCartItem.id } })

        return sendUpdatedCartResponse(
          res,
          cart.id,
          userId,
          'Item removed from cart',
          productWarehouseId,
          channel
        )
      }
    }

    const updateData = { quantity: newQuantity }

    if (
      existingCartItem.snapshotPrice == null ||
      Number(existingCartItem.snapshotPrice) !== Number(unitPrice)
    ) {
      updateData.snapshotPrice = unitPrice
      updateData.priceUpdatedAt = new Date()
    }

    await prisma.cartItem.update({
      where: { id: existingCartItem.id },
      data: updateData
    })

    logger.info('[Cart] Quantity updated', {
      userId,
      productId,
      productVariantId: productVariantId ?? null,
      newQuantity,
      unitPrice
    })
  } else {
    if (type === 'dec') {
      return errorResponse(res, 400, 'Cannot decrement an item that is not in the cart')
    }

    if (quantity < minQty) {
      return errorResponse(res, 400, `Minimum order quantity is ${minQty}`)
    }

    if (quantity > maxStock) {
      return errorResponse(
        res,
        400,
        `Only ${maxStock} units available in stock${
          variant ? ` for ${variant.variantName}` : ''
        }`
      )
    }

    if (maxQty != null && quantity > maxQty) {
      return errorResponse(
        res,
        400,
        `Maximum order quantity${variant ? ' for this variant' : ''} is ${maxQty}`
      )
    }

    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        productVariantId: productVariantId || null,
        quantity,
        snapshotPrice: unitPrice,
        priceUpdatedAt: new Date()
      }
    })

    logger.info('[Cart] New item added', {
      userId,
      productId,
      productVariantId: productVariantId ?? null,
      unitPrice
    })
  }

  return sendUpdatedCartResponse(
    res,
    cart.id,
    userId,
    'Cart updated successfully',
    productWarehouseId,
    channel
  )
})

async function sendUpdatedCartResponse(res, cartId, userId, message, warehouseId, channel = 'ONLINE') {
  if (!warehouseId) {
    logger.error('[Cart] Missing warehouseId in sendUpdatedCartResponse', {
      cartId,
      userId
    })

    return errorResponse(res, 400, 'Warehouse context missing')
  }

  const { cart: updatedCart } = await loadCartAndPrune(userId, warehouseId, channel)
  const effectiveCartItems = updatedCart?.items || []

  let coupon = null
  if (updatedCart?.appliedCouponId) {
    coupon = await prisma.coupon.findUnique({
      where: { id: updatedCart.appliedCouponId }
    })
  }

  const warehouse = await getWarehouseForCart(effectiveCartItems)
  const totals = await calculateCartTotals(
    effectiveCartItems,
    coupon,
    null,
    warehouse
  )

  if (updatedCart?.id) {
    await updateCartTaxFields(updatedCart.id, totals)
  }

  const formattedItems = effectiveCartItems.map(formatCartItem)

  return successResponse(
    res,
    200,
    {
      cart: {
        id: updatedCart?.id || null,
        items: formattedItems,
        appliedCoupon: updatedCart?.appliedCouponCode
          ? { code: updatedCart.appliedCouponCode, discount: totals.discount }
          : null,
        summary: {
          itemCount: totals.itemCount,
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxAmount: totals.taxAmount,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          taxableAmount: totals.taxableAmount,
          total: totals.total,
          warehouseId: totals.warehouseId
        }
      }
    },
    message
  )
}

/**
 * PATCH /api/v1/cart/items/:itemId
 */
export const updateCartItem = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { itemId } = req.params
  const { quantity } = req.body

  logger.info('[Cart] Updating cart item', { userId, itemId, quantity })

  const cartItem = await prisma.cartItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      cart: { select: { userId: true } },
      product: {
        select: {
          id: true,
          stock: true,
          isActive: true,
          status: true,
          taxRate: true,
          price: true,
          finalPrice: true,
          mrp: true,
          unit: true,
          measurement: true,
          sku: true,
          images: true,
          name: true,
          warehouseId: true,
          brand: { select: { id: true, name: true, image: true } },
          category: { select: { id: true, name: true } }
        }
      },
      productVariant: {
        select: {
          id: true,
          variantName: true,
          sku: true,
          unit: true,
          unitType: true,
          measurement: true,
          sellingPrice: true,
          mrp: true,
          stockQuantity: true,
          status: true,
          isEnabled: true,
          primaryImages: true
        }
      }
    }
  })

  if (!cartItem) {
    logger.warn('[Cart] Cart item not found', { itemId })
    return errorResponse(res, 404, 'Cart item not found')
  }

  if (cartItem.cart.userId !== userId) {
    logger.warn('[Cart] Unauthorized cart item access', { userId, itemId })
    return errorResponse(res, 403, 'Access denied')
  }

  if (!cartItem.product.isActive) {
    return errorResponse(res, 400, 'Product is not available')
  }

  if (cartItem.product.status !== 'APPROVED') {
    return errorResponse(res, 400, 'Product is not approved')
  }

  const lineWarehouseId = normalizeWarehouseId(cartItem.product.warehouseId)

  if (req.normalizedWarehouseId !== lineWarehouseId) {
    logCartWarehouseMismatch({
      userId,
      context: 'updateCartItem',
      requestedWarehouseId: req.normalizedWarehouseId,
      actualWarehouseId: lineWarehouseId,
      extra: { itemId }
    })

    return errorResponse(res, 400, 'Warehouse mismatch for cart')
  }

  const channel = req.query.channel || 'ONLINE'
  const cleanChannel = channel.toUpperCase()
  const targetChannel = lineWarehouseId && ['ONLINE', 'VEHICLE', 'POS'].includes(cleanChannel)
    ? `${cleanChannel}_${lineWarehouseId}`
    : channel

  if (cartItem.product) {
    const resolved = await PriceResolverService.resolvePrice({
      productId: cartItem.product.id,
      channel: targetChannel,
      quantity
    })
    cartItem.product.price = resolved.sellingPrice
    cartItem.product.mrp = resolved.mrp
    cartItem.product.finalPrice = resolved.sellingPrice

    if (cartItem.productVariant) {
      const resolvedVariant = await PriceResolverService.resolvePrice({
        productId: cartItem.product.id,
        productVariantId: cartItem.productVariant.id,
        channel: targetChannel,
        quantity
      })
      cartItem.productVariant.sellingPrice = resolvedVariant.sellingPrice
      cartItem.productVariant.mrp = resolvedVariant.mrp
      cartItem.productVariant.price = resolvedVariant.sellingPrice
      cartItem.productVariant.finalPrice = resolvedVariant.sellingPrice
    }
  }

  const effective = getEffectiveItemPricing(cartItem)

  if (
    cartItem.productVariant &&
    (!cartItem.productVariant.isEnabled || cartItem.productVariant.status !== 'ACTIVE')
  ) {
    return errorResponse(res, 400, 'This variant is not available')
  }

  if (quantity > effective.stock) {
    return errorResponse(
      res,
      400,
      `Only ${effective.stock} units available in stock`
    )
  }

  const updatedCartItem = await prisma.cartItem.update({
    where: { id: itemId },
    data: {
      quantity,
      snapshotPrice: effective.unitPrice,
      priceUpdatedAt: new Date()
    },
    select: {
      id: true,
      productId: true,
      productVariantId: true,
      quantity: true,
      addedAt: true,
      snapshotPrice: true,
      product: {
        select: {
          id: true,
          name: true,
          price: true,
          finalPrice: true,
          mrp: true,
          images: true,
          unit: true,
          measurement: true,
          stock: true,
          isActive: true,
          status: true,
          warehouseId: true,
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
          }
        }
      },
      productVariant: {
        select: {
          id: true,
          variantName: true,
          sku: true,
          unit: true,
          unitType: true,
          measurement: true,
          sellingPrice: true,
          mrp: true,
          stockQuantity: true,
          status: true,
          isEnabled: true,
          primaryImages: true
        }
      }
    }
  })

  const requestedWarehouseId = normalizeWarehouseId(cartItem.product.warehouseId)
  const { cart: warehouseCart } = await loadCartAndPrune(userId, requestedWarehouseId, channel)
  const effectiveCartItems = warehouseCart?.items || []

  let coupon = null
  if (warehouseCart?.appliedCouponId) {
    coupon = await prisma.coupon.findUnique({
      where: { id: warehouseCart.appliedCouponId }
    })
  }

  const warehouse = await getWarehouseForCart(effectiveCartItems)
  const totals = await calculateCartTotals(effectiveCartItems, coupon, null, warehouse)

  if (warehouseCart?.id) {
    await updateCartTaxFields(warehouseCart.id, totals)
  }

  const formattedItems = effectiveCartItems.map(formatCartItem)

  const response = {
    item: formatCartItemMinimal(updatedCartItem),
    cart: {
      id: warehouseCart?.id || null,
      items: formattedItems,
      appliedCoupon: warehouseCart?.appliedCouponCode
        ? {
            code: warehouseCart.appliedCouponCode,
            discount: totals.discount
          }
        : null,
      summary: {
        itemCount: totals.itemCount,
        subtotal: totals.subtotal,
        deliveryCharge: 0,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        taxableAmount: totals.taxableAmount,
        total: totals.total,
        warehouseId: totals.warehouseId
      }
    }
  }

  logger.info('[Cart] Cart item updated', { userId, itemId })

  return successResponse(res, 200, response, 'Cart item updated successfully')
})

/**
 * DELETE /api/v1/cart/items/:itemId
 */
export const removeCartItem = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { itemId } = req.params

  logger.info('[Cart] Removing cart item', { userId, itemId })

  const cartItem = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: {
      cart: {
        select: { userId: true }
      }
    }
  })

  if (!cartItem) {
    logger.warn('[Cart] Cart item not found', { itemId })
    return errorResponse(res, 404, 'Cart item not found')
  }

  if (cartItem.cart.userId !== userId) {
    logger.warn('[Cart] Unauthorized cart item access', { userId, itemId })
    return errorResponse(res, 403, 'Access denied')
  }

  const removedItemProduct = await prisma.product.findUnique({
    where: { id: cartItem.productId },
    select: { warehouseId: true, status: true, isActive: true }
  })

  if (!removedItemProduct?.warehouseId) {
    logger.error('[Cart] Product warehouse missing during removeCartItem', {
      cartItemId: cartItem.id,
      userId
    })

    return errorResponse(res, 400, 'Unable to resolve warehouse for cart item')
  }

  const lineWarehouseId = normalizeWarehouseId(removedItemProduct.warehouseId)

  if (req.normalizedWarehouseId !== lineWarehouseId) {
    logCartWarehouseMismatch({
      userId,
      context: 'removeCartItem',
      requestedWarehouseId: req.normalizedWarehouseId,
      actualWarehouseId: lineWarehouseId,
      extra: { itemId }
    })

    return errorResponse(res, 400, 'Warehouse mismatch for cart')
  }

  const requestedWarehouseId = lineWarehouseId

  await prisma.cartItem.delete({
    where: { id: itemId }
  })

  const channel = req.query.channel || 'ONLINE'
  const { cart: warehouseCart } = await loadCartAndPrune(userId, requestedWarehouseId, channel)
  const effectiveCartItems = warehouseCart?.items || []

  let coupon = null
  if (warehouseCart?.appliedCouponId) {
    coupon = await prisma.coupon.findUnique({
      where: { id: warehouseCart.appliedCouponId }
    })
  }

  const warehouse = await getWarehouseForCart(effectiveCartItems)
  const totals = await calculateCartTotals(effectiveCartItems, coupon, null, warehouse)

  if (warehouseCart?.id) {
    await updateCartTaxFields(warehouseCart.id, totals)
  }

  const formattedItems = effectiveCartItems.map(formatCartItem)

  const response = {
    cart: {
      id: warehouseCart?.id || null,
      items: formattedItems,
      appliedCoupon: warehouseCart?.appliedCouponCode
        ? {
            code: warehouseCart.appliedCouponCode,
            discount: totals.discount
          }
        : null,
      summary: {
        itemCount: totals.itemCount,
        subtotal: totals.subtotal,
        deliveryCharge: 0,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        taxableAmount: totals.taxableAmount,
        total: totals.total,
        warehouseId: totals.warehouseId
      }
    }
  }

  logger.info('[Cart] Cart item removed', { userId, itemId })

  return successResponse(
    res,
    200,
    response,
    'Item removed from cart successfully'
  )
})

/**
 * DELETE /api/v1/cart
 */
export const clearCart = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const requestedWarehouseId = req.normalizedWarehouseId

  logger.info('[Cart] Clearing cart', { userId, warehouseId: requestedWarehouseId })

  const cart = await prisma.cart.findFirst({
    where: { userId, warehouseId: requestedWarehouseId }
  })

  if (!cart) {
    return successResponse(
      res,
      200,
      {
        cart: null,
        warehouseId: requestedWarehouseId,
        cleared: false
      },
      'Cart is already empty'
    )
  }

  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id }
  })

  await prisma.cart.update({
    where: { id: cart.id },
    data: {
      appliedCouponId: null,
      appliedCouponCode: null,
      taxAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxableAmount: 0
    }
  })

  logger.info('[Cart] Cart cleared', { userId, warehouseId: requestedWarehouseId })

  return successResponse(
    res,
    200,
    {
      cart: {
        id: cart.id,
        items: [],
        appliedCoupon: null,
        summary: {
          itemCount: 0,
          subtotal: 0,
          deliveryCharge: 0,
          discount: 0,
          taxAmount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          taxableAmount: 0,
          total: 0,
          warehouseId: requestedWarehouseId
        }
      },
      warehouseId: requestedWarehouseId,
      cleared: true
    },
    'Cart cleared successfully'
  )
})

/**
 * GET /api/v1/cart/summary
 */
export const getCartSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { addressId } = req.query
  const requestedWarehouseId = req.normalizedWarehouseId

  logger.info('[Cart] Fetching cart summary', {
    userId,
    addressId,
    warehouseId: requestedWarehouseId
  })

  const channel = req.query.channel || 'ONLINE'
  const { cart, removedInvalidCount } = await loadCartAndPrune(
    userId,
    requestedWarehouseId,
    channel
  )

  const effectiveCartItems = cart?.items || []

  let coupon = null
  if (cart?.appliedCouponId) {
    coupon = await prisma.coupon.findUnique({
      where: { id: cart.appliedCouponId }
    })
  }

  let deliveryAddress = null

  if (addressId) {
    deliveryAddress = await prisma.address.findUnique({
      where: { id: addressId },
      select: {
        id: true,
        pincode: true,
        state: true,
        city: true,
        location: true
      }
    })
  } else {
    const defaultAddress = await prisma.address.findFirst({
      where: {
        userId,
        isDefault: true
      },
      select: {
        id: true,
        pincode: true,
        state: true,
        city: true,
        location: true
      }
    })

    if (defaultAddress) {
      deliveryAddress = defaultAddress
    }
  }

  const warehouse = await getWarehouseForCart(effectiveCartItems)

  const totals = await calculateCartTotals(
    effectiveCartItems,
    coupon,
    deliveryAddress,
    warehouse
  )

  const cartItems = effectiveCartItems.filter(item => {
    if (!item.product?.isActive || item.product?.status !== 'APPROVED') return false

    if (
      item.productVariant &&
      (!item.productVariant.isEnabled || item.productVariant.status !== 'ACTIVE')
    ) {
      return false
    }

    return true
  })

  const totalItemSavings = cartItems.reduce((sum, item) => {
    const effective = getEffectiveItemPricing(item)

    if (effective.mrp && effective.mrp > effective.unitPrice) {
      const availableQuantity = Math.min(item.quantity, effective.stock)
      return sum + (effective.mrp - effective.unitPrice) * availableQuantity
    }

    return sum
  }, 0)

  const totalSavings =
    Math.round((totalItemSavings + totals.discount) * 100) / 100

  let distance = null

  if (
    deliveryAddress &&
    deliveryAddress.location &&
    warehouse &&
    warehouse.location
  ) {
    distance = calculateDeliveryDistance(
      warehouse.location,
      deliveryAddress.location
    )
  }

  const deliveryOptions = await getAvailableDeliveryTypes(
    totals.warehouseId,
    deliveryAddress,
    totals.totalWithDelivery || totals.total
  )

  const outOfStockCount = effectiveCartItems.filter(item => {
    const effective = getEffectiveItemPricing(item)

    return (
      effective.stock === 0 ||
      (item.productVariant &&
        (!item.productVariant.isEnabled || item.productVariant.status !== 'ACTIVE'))
    )
  }).length

  const priceChangedCount = effectiveCartItems.filter(item => {
    const effective = getEffectiveItemPricing(item)
    return item.snapshotPrice != null && Number(item.snapshotPrice) !== Number(effective.unitPrice)
  }).length

  const response = {
    itemCount: totals.itemCount,
    subtotal: totals.subtotal,
    totalSavings,
    savingsBreakdown: {
      items: Math.round(totalItemSavings * 100) / 100,
      coupon: totals.discount
    },
    deliveryCharge: totals.deliveryCharge || 0,
    deliveryDistance: distance,
    discount: totals.discount,
    taxAmount: totals.taxAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    taxableAmount: totals.taxableAmount,
    total: totals.total,
    totalWithDelivery: totals.totalWithDelivery || totals.total,
    warehouseId: totals.warehouseId,
    appliedCoupon: cart?.appliedCouponCode
      ? {
          code: cart.appliedCouponCode,
          discount: totals.discount
        }
      : null,
    alerts: {
      outOfStock: {
        count: outOfStockCount,
        hasAlerts: outOfStockCount > 0
      },
      priceChanged: {
        count: priceChangedCount,
        hasAlerts: priceChangedCount > 0
      }
    },
    deliveryOptions,
    billDetails: {
      items: totals.subtotal,
      totalSavings,
      savingsBreakdown: {
        items: Math.round(totalItemSavings * 100) / 100,
        coupon: totals.discount
      },
      promocodeApplied: totals.discount,
      deliveryFee: {
        amount: deliveryOptions.fast?.charge || totals.deliveryCharge || 0,
        distance,
        type: 'FAST',
        eta: deliveryOptions.fast?.eta || null,
        label: distance ? `Delivery fee | ${distance} km` : 'Delivery fee'
      },
      taxesAndCharges: totals.taxAmount,
      taxBreakdown: {
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst
      },
      toPay: totals.totalWithDelivery || totals.total
    },
    cartHydration: {
      removedInvalidItemCount: removedInvalidCount,
      hadInvalidItemsRemoved: removedInvalidCount > 0
    }
  }

  return successResponse(
    res,
    200,
    response,
    'Cart summary fetched successfully'
  )
})

/**
 * POST /api/v1/cart/apply-coupon
 */
/**
 * POST /api/v1/cart/apply-coupon
 */
export const applyCouponToCart = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { couponCode } = req.body
  const requestedWarehouseId = req.normalizedWarehouseId

  logger.info('[Cart] Applying coupon to cart', {
    userId,
    couponCode,
    warehouseId: requestedWarehouseId
  })

  if (!requestedWarehouseId) {
    return errorResponse(res, 400, 'Warehouse is required to apply coupon')
  }

  if (!couponCode || !couponCode.trim()) {
    return errorResponse(res, 400, 'Coupon code is required')
  }

  const normalizedCouponCode = couponCode.trim()

  const channel = req.query.channel || 'ONLINE'
  const { cart } = await loadCartAndPrune(userId, requestedWarehouseId, channel)
  const effectiveCartItems = cart?.items || []

  if (!cart || effectiveCartItems.length === 0) {
    return errorResponse(
      res,
      400,
      'Cart is empty. Add items to cart before applying coupon.'
    )
  }

  /**
   * IMPORTANT:
   * Try specific warehouse coupon first, then fallback to global coupon
   */
  let coupon = await prisma.coupon.findUnique({
    where: {
      code_warehouseId: {
        code: normalizedCouponCode,
        warehouseId: requestedWarehouseId
      }
    }
  })

  if (!coupon) {
    coupon = await prisma.coupon.findFirst({
      where: {
        code: { equals: normalizedCouponCode, mode: 'insensitive' },
        isActive: true,
        OR: [
          { warehouseId: requestedWarehouseId },
          { warehouseId: null },
          { scope: 'GLOBAL' },
          { scope: 'global' },
          { scope: null }
        ]
      }
    })
  }

  if (!coupon) {
    logger.warn('[Cart] Invalid coupon for warehouse', {
      userId,
      couponCode: normalizedCouponCode,
      warehouseId: requestedWarehouseId
    })

    return errorResponse(res, 400, 'Invalid coupon code for this warehouse')
  }

  if (!coupon.isActive) {
    return errorResponse(res, 400, 'Coupon is inactive')
  }

  const now = new Date()

  if (coupon.startDate && new Date(coupon.startDate) > now) {
    return errorResponse(res, 400, 'Coupon is not active yet')
  }

  if (coupon.expiryDate && new Date(coupon.expiryDate) < now) {
    return errorResponse(res, 400, 'Coupon has expired')
  }

  /**
   * Optional pincode validation if your Coupon has applicablePincodes.
   * This will work only when cart summary/apply coupon sends addressId.
   * If you do not need pincode validation here, keep it as optional.
   */
  const { addressId } = req.body

  let deliveryAddress = null

  if (addressId) {
    deliveryAddress = await prisma.address.findFirst({
      where: {
        id: addressId,
        userId
      },
      select: {
        id: true,
        pincode: true,
        state: true,
        city: true,
        location: true
      }
    })

    if (!deliveryAddress) {
      return errorResponse(res, 404, 'Delivery address not found')
    }
  }

  if (
    Array.isArray(coupon.applicablePincodes) &&
    coupon.applicablePincodes.length > 0 &&
    deliveryAddress?.pincode
  ) {
    const normalizedPincode = String(deliveryAddress.pincode).trim()

    const isPincodeAllowed = coupon.applicablePincodes.some(
      pincode => String(pincode).trim() === normalizedPincode
    )

    if (!isPincodeAllowed) {
      return errorResponse(
        res,
        400,
        'Coupon is not applicable for this delivery pincode'
      )
    }
  }

  const warehouse = await getWarehouseForCart(effectiveCartItems)

  const initialTotals = await calculateCartTotals(
    effectiveCartItems,
    null,
    deliveryAddress,
    warehouse
  )

  const subtotal = initialTotals.subtotal

  if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
    return errorResponse(
      res,
      400,
      `Minimum order value of ₹${coupon.minOrderValue} required for this coupon`
    )
  }

  if (coupon.maxUsesPerUser) {
    const usageCount = await prisma.couponRedemption.count({
      where: {
        userId,
        couponId: coupon.id
      }
    })

    if (usageCount >= coupon.maxUsesPerUser) {
      return errorResponse(res, 400, 'Coupon usage limit reached')
    }
  }

  if (coupon.maxTotalUses && coupon.totalUses >= coupon.maxTotalUses) {
    return errorResponse(res, 400, 'Coupon has reached maximum usage limit')
  }

  if (coupon.newUserOnly) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true }
    })

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    if (!user || user.createdAt < thirtyDaysAgo) {
      return errorResponse(res, 400, 'This coupon is only for new users')
    }
  }

  if (coupon.firstOrderOnly) {
    const orderCount = await prisma.order.count({
      where: {
        consumerId: userId,
        status: {
          not: 'CANCELLED'
        }
      }
    })

    if (orderCount > 0) {
      return errorResponse(res, 400, 'This coupon is only for first order')
    }
  }

  const discount = calculateCouponDiscount(coupon, subtotal)
  
  if (discount <= 0) {
    return errorResponse(res, 400, 'Coupon does not apply to this cart')
  }

  await prisma.cart.update({
    where: { id: cart.id },
    data: {
      appliedCouponId: coupon.id,
      appliedCouponCode: coupon.code
    }
  })

  const { cart: updatedCart } = await loadCartAndPrune(
    userId,
    requestedWarehouseId,
    channel
  )

  const updatedScopedItems = updatedCart?.items || []

  const updatedWarehouse = await getWarehouseForCart(updatedScopedItems)

  const totals = await calculateCartTotals(
    updatedScopedItems,
    coupon,
    deliveryAddress,
    updatedWarehouse
  )

  if (updatedCart?.id) {
    await updateCartTaxFields(updatedCart.id, totals)
  }

  const formattedItems = updatedScopedItems.map(formatCartItem)

  const response = {
    cart: {
      id: updatedCart?.id ?? cart.id,
      items: formattedItems,
      appliedCoupon: {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        discount: totals.discount
      },
      summary: {
        itemCount: totals.itemCount,
        subtotal: totals.subtotal,
        deliveryCharge: totals.deliveryCharge || 0,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        taxableAmount: totals.taxableAmount,
        total: totals.total,
        totalWithDelivery: totals.totalWithDelivery || totals.total,
        warehouseId: totals.warehouseId
      }
    }
  }

  logger.info('[Cart] Coupon applied successfully', {
    userId,
    couponCode: normalizedCouponCode,
    couponId: coupon.id,
    warehouseId: requestedWarehouseId,
    subtotal,
    discount
  })

  return successResponse(res, 200, response, 'Coupon applied successfully')
})

/**
 * GET /api/v1/cart/validate
 */
export const validateCart = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { addressId } = req.query
  const requestedWarehouseId = req.normalizedWarehouseId

  logger.info('[Cart] Validating cart', {
    userId,
    addressId,
    warehouseId: requestedWarehouseId
  })

  const channel = req.query.channel || 'ONLINE'
  const { cart, removedInvalidCount } = await loadCartAndPrune(
    userId,
    requestedWarehouseId,
    channel
  )

  const effectiveCartItems = cart?.items || []

  if (!cart || effectiveCartItems.length === 0) {
    return successResponse(
      res,
      200,
      {
        valid: false,
        issues: [{ type: 'EMPTY_CART', message: 'Cart is empty' }],
        warnings: [],
        cartHydration: {
          removedInvalidItemCount: removedInvalidCount,
          hadInvalidItemsRemoved: removedInvalidCount > 0
        }
      },
      'Cart validation completed'
    )
  }

  const { validateCart: validateCartItems } = await import(
    '../utils/cartValidation.js'
  )

  const cartItemsForValidation = effectiveCartItems.map(item => ({
    productId: item.productId,
    productVariantId: item.productVariantId ?? undefined,
    quantity: item.quantity,
    snapshotPrice: item.snapshotPrice
  }))

  const validation = await validateCartItems(
    cartItemsForValidation,
    addressId || null
  )

  const out = {
    ...validation,
    cartHydration: {
      removedInvalidItemCount: removedInvalidCount,
      hadInvalidItemsRemoved: removedInvalidCount > 0
    }
  }

  return successResponse(res, 200, out, 'Cart validation completed')
})

export const removeCouponFromCart = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const requestedWarehouseId = req.normalizedWarehouseId

  logger.info('[Cart] Removing coupon from cart', {
    userId,
    warehouseId: requestedWarehouseId
  })

  const cart = await prisma.cart.findFirst({
    where: { userId, warehouseId: requestedWarehouseId }
  })

  if (!cart) {
    return errorResponse(res, 404, 'Cart not found')
  }

  if (!cart?.appliedCouponId) {
    return errorResponse(res, 400, 'No coupon applied to cart')
  }

  await prisma.cart.update({
    where: { id: cart.id },
    data: {
      appliedCouponId: null,
      appliedCouponCode: null
    }
  })

  const channel = req.query.channel || 'ONLINE'
  const { cart: updatedCart } = await loadCartAndPrune(userId, requestedWarehouseId, channel)
  const updatedScopedItems = updatedCart?.items || []

  const warehouse = await getWarehouseForCart(updatedScopedItems)

  const totals = await calculateCartTotals(
    updatedScopedItems,
    null,
    null,
    warehouse
  )

  if (updatedCart?.id) {
    await updateCartTaxFields(updatedCart.id, totals)
  }

  const formattedItems = updatedScopedItems.map(formatCartItem)

  const response = {
    cart: {
      id: updatedCart?.id ?? cart.id,
      items: formattedItems,
      appliedCoupon: null,
      summary: {
        itemCount: totals.itemCount,
        subtotal: totals.subtotal,
        deliveryCharge: 0,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        taxableAmount: totals.taxableAmount,
        total: totals.total,
        warehouseId: totals.warehouseId
      }
    }
  }

  logger.info('[Cart] Coupon removed successfully', { userId })

  return successResponse(res, 200, response, 'Coupon removed successfully')
})