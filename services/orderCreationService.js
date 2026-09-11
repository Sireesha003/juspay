/**
 * Shared order creation service.
 * Used by POST /api/v1/orders (create order from cart).
 * Contains order creation logic: pricing, coupon, tax, delivery by type,
 * slot booking, inventory deduction, payment/delivery records, cart clear, coupon redemption.
 * Controllers remain versioned and are responsible for validation, response formatting, and notifications.
 */

import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'
import { generateOrderNumber, validateWarehouseConsistency, validateStockAvailability } from '../utils/orderUtils.js'
import { getDeliveryChargeForOrder, isDeliveryTypeEnabled } from '../utils/warehouseDeliverySettingUtils.js'
import { bookDeliverySlotWithTx, resolveRouteMapIdsForAddress } from '../utils/deliverySlotUtils.js'
import { releaseSlot } from './deliverySlotService.js'
import { reservePickupSlot, releasePickupSlot } from './pickupSlotService.js'
import { toUTCDateOnly, isTodayOrFuture, isSlotStartInPast } from '../utils/dateUtils.js'
import { calculateTaxAfterDiscount, getStateCode, calculateGST } from '../utils/taxUtils.js'
import { mapProductUnitToStandardUnits } from '../utils/unitUtils.js'
import { DEFAULT_GST_RATE } from '../utils/taxUtils.js'
import { assertAddressServiceableForWarehouse } from '../utils/warehouseServiceabilityUtils.js'
import { calculateCouponDiscount } from '../utils/couponTypeUtils.js'
import { normalizeWarehouseId } from '../utils/cartWarehouseUtils.js'
import { validateAndSanitizeCart } from '../utils/cartSanitization.js'
import { PriceResolverService } from './priceResolverService.js'

/** Stable signature of cart/order lines for checkout reuse (product + variant + qty). */
function checkoutLinesFingerprint(lineRows) {
  const map = new Map()
  for (const row of lineRows) {
    const vid = row.productVariantId != null ? String(row.productVariantId) : ''
    const key = `${String(row.productId)}\t${vid}`
    const q = Number(row.quantity) || 0
    if (q <= 0) continue
    map.set(key, (map.get(key) ?? 0) + q)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, q]) => `${k}:${q}`)
    .join('|')
}

function normalizeCouponCodeForReuse(code) {
  if (code == null || !String(code).trim()) return ''
  return String(code).trim().toLowerCase()
}


function getProductCheckoutPrice(product) {
  return product?.finalPrice != null
    ? Number(product.finalPrice)
    : Number(product?.price || 0)
}

function getCheckoutItemUnitPrice(item) {
  const product = item.product
  const variant = item.productVariant

  if (variant && variant.isEnabled && variant.status === 'ACTIVE') {
    return variant.sellingPrice != null
      ? Number(variant.sellingPrice)
      : (variant.mrp != null ? Number(variant.mrp) : getProductCheckoutPrice(product))
  }

  return getProductCheckoutPrice(product)
}
/**
 * Cancel an unpaid PLACED order so checkout can create a fresh order from the current cart.
 * Restores inventory and releases delivery/pickup slots (same responsibilities as customer cancel).
 */
async function supersedeUnpaidPendingOrderForCartChange(userId, orderId) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id: orderId,
        consumerId: userId,
        status: { in: ['PENDING', 'PLACED', 'PAYMENT_FAILED'] },
        payment: { is: { status: 'PENDING' } },
      },
      include: {
        items: true,
        payment: true,
      },
    })
    if (!order) {
      logger.warn('[OrderCreationService] Supersede skipped: order not found or not eligible', {
        userId,
        orderId,
      })
      return
    }

    await releaseSlot(tx, order)
    if (order.pickupSlotId) {
      await releasePickupSlot(tx, order)
    }

    for (const item of order.items) {
      if (item.isCancelled) continue
      if (item.productVariantId) {
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { stockQuantity: { increment: item.quantity } },
        })
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        })
      }
    }

    const redemptions = await tx.couponRedemption.findMany({ where: { orderId: order.id } })
    for (const r of redemptions) {
      await tx.coupon.update({
        where: { id: r.couponId },
        data: { totalUses: { decrement: 1 } },
      })
    }
    await tx.couponRedemption.deleteMany({ where: { orderId: order.id } })

    if (order.payment) {
      await tx.payment.update({
        where: { id: order.payment.id },
        data: { status: 'FAILED' },
      })
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: 'Cart updated before payment',
      },
    })
  })

  logger.info('[OrderCreationService] Superseded unpaid pending order (cart or coupon changed)', {
    userId,
    orderId,
  })
}

async function resolveCartPricing(cart, channel = 'ONLINE') {
  if (!cart || !cart.items) return cart

  const bundleIds = [...new Set(cart.items.filter(i => i.bundleId).map(i => i.bundleId))]
  const bundles = bundleIds.length > 0 ? await prisma.bundle.findMany({ where: { id: { in: bundleIds } } }) : []
  const bundleMap = Object.fromEntries(bundles.map(b => [b.id, b]))

  // Calculate original total for each bundle in the cart to calculate prorata
  const bundleOriginalTotals = {}
  for (const item of cart.items) {
    if (item.bundleId && bundleMap[item.bundleId]) {
      const wId = item.product?.warehouseId || cart.warehouseId
      const cleanChannel = (channel || 'ONLINE').toUpperCase()
      const targetChannel = wId && ['ONLINE', 'VEHICLE', 'POS'].includes(cleanChannel)
        ? `${cleanChannel}_${wId}`
        : channel

      const resolved = await PriceResolverService.resolvePrice({
        productId: item.product.id,
        productVariantId: item.productVariant?.id || null,
        channel: targetChannel,
        quantity: item.quantity
      })
      bundleOriginalTotals[item.bundleId] = (bundleOriginalTotals[item.bundleId] || 0) + (resolved.sellingPrice * item.quantity)
    }
  }

  for (const item of cart.items) {
    if (item.product) {
      const wId = item.product.warehouseId || cart.warehouseId
      const cleanChannel = (channel || 'ONLINE').toUpperCase()
      const targetChannel = wId && ['ONLINE', 'VEHICLE', 'POS'].includes(cleanChannel)
        ? `${cleanChannel}_${wId}`
        : channel

      const resolvedProduct = await PriceResolverService.resolvePrice({
        productId: item.product.id,
        channel: targetChannel,
        quantity: item.quantity
      })

      let sellingPrice = resolvedProduct.sellingPrice
      let mrp = resolvedProduct.mrp

      if (item.bundleId && bundleMap[item.bundleId]) {
        const bundle = bundleMap[item.bundleId]
        const originalTotal = bundleOriginalTotals[item.bundleId] || 1
        const ratio = (resolvedProduct.sellingPrice * item.quantity) / originalTotal
        sellingPrice = (bundle.bundlePrice * ratio) / item.quantity
      }

      item.product.price = sellingPrice
      item.product.mrp = mrp
      item.product.finalPrice = sellingPrice

      if (item.productVariant) {
        const resolvedVariant = await PriceResolverService.resolvePrice({
          productId: item.product.id,
          productVariantId: item.productVariant.id,
          channel: targetChannel,
          quantity: item.quantity
        })

        let variantSellingPrice = resolvedVariant.sellingPrice
        if (item.bundleId && bundleMap[item.bundleId]) {
          const bundle = bundleMap[item.bundleId]
          const originalTotal = bundleOriginalTotals[item.bundleId] || 1
          const ratio = (resolvedVariant.sellingPrice * item.quantity) / originalTotal
          variantSellingPrice = (bundle.bundlePrice * ratio) / item.quantity
        }

        item.productVariant.sellingPrice = variantSellingPrice
        item.productVariant.mrp = resolvedVariant.mrp
        item.productVariant.price = variantSellingPrice
        item.productVariant.finalPrice = variantSellingPrice
      }
    }
  }
  return cart
}

/**
 * Create order from cart.
 * Uses delivery by type, slot booking, tax/discount/coupon, inventory, etc.
 *
 * @param {string} userId - Consumer user id
 * @param {Object} payload - { warehouseId, deliveryType?, addressId?, deliverySlot?, deliveryDate?, pickupTimeSlot?, specialInstructions?, couponCode? }
 * @returns {Promise<{ orderId: string, order: import('@prisma/client').Order }>} Created order id and raw order entity (no relations)
 * @throws Error with user-facing message on validation or business rule failure
 */
export async function createOrder(userId, payload) {
  const {
    warehouseId,
    deliveryType: deliveryTypeParam,
    addressId,
    deliverySlot,
    deliveryDate,
    pickupTimeSlot,
    pickupSlotId: payloadPickupSlotId,
    specialInstructions,
    couponCode
  } = payload

  // Optional: accept orderStatus in payload for API consistency (PENDING/PLACED/FAILED); created order is always PENDING on success
  const orderStatus = payload.orderStatus
  if (orderStatus && !['PENDING', 'PLACED', 'FAILED'].includes(orderStatus)) {
    throw new Error('Invalid order status. Only PENDING, PLACED or FAILED are allowed.')
  }

  const normalizedWarehouseId = normalizeWarehouseId(warehouseId)
  if (!normalizedWarehouseId) {
    throw new Error('Warehouse ID is required')
  }

  const fetchCartForCheckout = async () =>
    prisma.cart.findFirst({
      where: { userId, warehouseId: normalizedWarehouseId },
      select: {
        id: true,
        userId: true,
        warehouseId: true,
        appliedCouponCode: true,
        expiresAt: true,
        items: {
          select: {
            id: true,
            quantity: true,
            productId: true,
            productVariantId: true,
            bundleId: true,
            snapshotPrice: true,
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                finalPrice: true, // ✅ ADD THIS
                stock: true,
                isActive: true,
                status: true, // ✅ recommended, same as cart validation
                warehouseId: true,
                taxRate: true,
                mrp: true,
                images: true,
                unit: true,
                measurement: true
              }
            },
            productVariant: {
              select: {
                id: true,
                variantName: true,
                sellingPrice: true,
                stockQuantity: true,
                unit: true,
                mrp: true,
                status: true,
                isEnabled: true,
                primaryImages: true
              }
            }
          }
        }
      }
    })

  let cart = await fetchCartForCheckout()
  if (cart) {
    const sanitation = await validateAndSanitizeCart(prisma, cart, normalizedWarehouseId, {
      resetCartMetaWhenEmpty: true
    })
    if (sanitation.removedInvalidCount > 0) {
      logger.warn('[OrderCreationService] Checkout cart sanitized before validation', {
        userId,
        warehouseId: normalizedWarehouseId,
        removedInvalidCount: sanitation.removedInvalidCount,
        invalidReasons: sanitation.invalidReasons
      })
      cart = await fetchCartForCheckout()
    }
  }

  if (cart) {
    cart = await resolveCartPricing(cart, payload.channel || 'ONLINE')
  }

  if (!cart || cart.items.length === 0) {
    throw new Error('Cart is empty')
  }

  if (cart.expiresAt && new Date() > new Date(cart.expiresAt)) {
    throw new Error('Cart has expired. Please refresh your cart and try again.')
  }

  const existingPendingOrder = await prisma.order.findFirst({
    where: {
      consumerId: userId,
      warehouseId: normalizedWarehouseId,
      status: 'PENDING',
      payment: { is: { status: 'PENDING' } }
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      addressId: true,
      deliveryType: true,
      couponCode: true,
      items: {
        select: {
          productId: true,
          productVariantId: true,
          quantity: true,
          isCancelled: true
        }
      }
    }
  })

  const normalizedAddressId = addressId ? String(addressId).trim() : null
  const pendingActiveItems =
    existingPendingOrder?.items?.filter((i) => !i.isCancelled) ?? []

  const reuseCandidate =
    existingPendingOrder &&
    pendingActiveItems.length > 0 &&
    (!normalizedAddressId || existingPendingOrder.addressId === normalizedAddressId) &&
    (!deliveryTypeParam || existingPendingOrder.deliveryType === deliveryTypeParam)

  if (reuseCandidate) {
    const cartFp = checkoutLinesFingerprint(cart.items)
    const orderFp = checkoutLinesFingerprint(pendingActiveItems)
    const cartCouponNorm = normalizeCouponCodeForReuse(cart.appliedCouponCode || couponCode)
    const orderCouponNorm = normalizeCouponCodeForReuse(existingPendingOrder.couponCode)
    if (cartFp === orderFp && cartCouponNorm === orderCouponNorm) {
      logger.info('[OrderCreationService] Reusing existing pending order', {
        userId,
        orderId: existingPendingOrder.id,
        warehouseId: normalizedWarehouseId
      })
      await prisma.order.update({
        where: { id: existingPendingOrder.id },
        data: { status: orderStatus || 'PENDING' }
      });
      return {
        orderId: existingPendingOrder.id,
        reusedExistingOrder: true,
        shouldClearCart: false
      }
    }
  }

  const deliveryType = deliveryTypeParam && ['FAST', 'SCHEDULED', 'PICKUP_STORE'].includes(deliveryTypeParam)
    ? deliveryTypeParam
    : 'FAST'

  const deliveryTypeEnabled = await isDeliveryTypeEnabled(normalizedWarehouseId, deliveryType)
  if (!deliveryTypeEnabled) {
    throw new Error(
      `Selected delivery type (${deliveryType}) is not enabled for this warehouse. Please choose another option.`
    )
  }

  const warehouseValidation = await validateWarehouseConsistency(cart.items)
  if (!warehouseValidation.valid) {
    throw new Error(warehouseValidation.error)
  }
  if (warehouseValidation.warehouseId !== normalizedWarehouseId) {
    logger.warn('[OrderCreationService] Warehouse mismatch for checkout', {
      userId,
      requestedWarehouseId: normalizedWarehouseId,
      cartDerivedWarehouseId: warehouseValidation.warehouseId
    })
    throw new Error(
      'Some items are no longer available in this warehouse. Refresh your cart and try again.'
    )
  }

  const stockValidation = await validateStockAvailability(
    cart.items.map((i) => ({
      productId: i.productId,
      productVariantId: i.productVariantId ?? undefined,
      quantity: i.quantity
    }))
  )
  if (!stockValidation.valid) {
    const err = new Error('Some items are out of stock')
    err.stockIssues = stockValidation.issues
    throw err
  }

  let address = null
  let resolvedAddressId = addressId

  if (deliveryType === 'PICKUP_STORE') {
    /**
     * Self pickup does not require customer delivery address.
     * If addressId is sent optionally, validate it and save it.
     * If addressId is not sent, keep addressId as null.
     */
    if (addressId) {
      address = await prisma.address.findUnique({
        where: { id: addressId }
      })

      if (!address || address.userId !== userId) {
        throw new Error('Address not found or does not belong to you')
      }

      resolvedAddressId = address.id
    } else {
      address = null
      resolvedAddressId = null
    }
  } else {
    /**
     * FAST and SCHEDULED delivery require customer address.
     */
    if (!addressId) {
      throw new Error('Address ID is required for FAST and SCHEDULED delivery')
    }

    address = await prisma.address.findUnique({
      where: { id: addressId }
    })

    if (!address || address.userId !== userId) {
      throw new Error('Address not found or does not belong to you')
    }

    resolvedAddressId = address.id
  }

  if (deliveryType === 'FAST' || deliveryType === 'SCHEDULED') {
    await assertAddressServiceableForWarehouse(warehouseValidation.warehouseId, address)
  }

  if (deliveryType === 'SCHEDULED') {
    const slotDate = deliveryDate ? toUTCDateOnly(deliveryDate) : null
    if (!slotDate) {
      throw new Error('Valid delivery date is required for SCHEDULED delivery')
    }
    if (!isTodayOrFuture(slotDate)) {
      throw new Error('Delivery date must be today or a future date')
    }
  }

  if (deliveryType === 'PICKUP_STORE') {
    const store = await prisma.warehouse.findUnique({
      where: { id: warehouseValidation.warehouseId },
      select: { id: true, name: true, address: true, isPickupStore: true, pickupTimeSlots: true }
    })
    if (!store) {
      throw new Error('Pickup store not found')
    }
    if (!store.isPickupStore) {
      throw new Error('Selected warehouse is not a pickup store')
    }
    if (payloadPickupSlotId) {
      const pickupSlotRow = await prisma.pickupSlot.findFirst({
        where: { id: payloadPickupSlotId, warehouseId: warehouseValidation.warehouseId, isActive: true },
        select: { id: true, capacity: true, booked: true },
      })
      if (!pickupSlotRow) {
        throw new Error('Selected pickup slot is not available for this store')
      }
      if (pickupSlotRow.booked >= pickupSlotRow.capacity) {
        throw new Error('This pickup slot is full. Please choose another.')
      }
    } else {
      const slots = store.pickupTimeSlots
      if (slots && Array.isArray(slots)) {
        const hasSlot = slots.some(
          (s) =>
            (s.time && String(s.time).trim() === String(pickupTimeSlot).trim()) ||
            (s.slot && String(s.slot).trim() === String(pickupTimeSlot).trim())
        )
        if (!hasSlot) {
          throw new Error(`Pickup time slot "${pickupTimeSlot}" is not valid for this store`)
        }
      }
    }
  }

  let subtotal = 0
  for (const item of cart.items) {
    if (!item.product?.isActive) continue
    const variant = item.productVariant
    if (variant && (!variant.isEnabled || variant.status !== 'ACTIVE')) continue
    const unitPrice = getCheckoutItemUnitPrice(item)
    const stock = variant ? (variant.stockQuantity ?? 0) : item.product.stock
    const qty = Math.min(item.quantity, stock)
    subtotal += unitPrice * qty
  }
  subtotal = Math.round(subtotal * 100) / 100

  let coupon = null
  let discount = 0
  let couponId = null

  const couponToUse = cart.appliedCouponCode || couponCode

  if (couponToUse && String(couponToUse).trim()) {
    const normalizedCouponCode = String(couponToUse).trim()
    const now = new Date()

    coupon = await prisma.coupon.findUnique({
      where: {
        code_warehouseId: {
          code: normalizedCouponCode,
          warehouseId: normalizedWarehouseId
        }
      }
    })

    if (!coupon) {
      throw new Error('Invalid coupon code for this warehouse')
    }

    if (!coupon.isActive) {
      throw new Error('Coupon is inactive')
    }

    if (coupon.startDate && new Date(coupon.startDate) > now) {
      throw new Error('Coupon is not active yet')
    }

    if (coupon.expiryDate && new Date(coupon.expiryDate) < now) {
      throw new Error('Coupon has expired')
    }

    if (coupon.maxUsesPerUser) {
      const usageCount = await prisma.couponRedemption.count({
        where: {
          userId,
          couponId: coupon.id
        }
      })

      if (usageCount >= coupon.maxUsesPerUser) {
        throw new Error('Coupon usage limit reached')
      }
    }

    if (coupon.maxTotalUses && coupon.totalUses >= coupon.maxTotalUses) {
      throw new Error('Coupon has reached maximum usage limit')
    }

    if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
      throw new Error(
        `Minimum order value of ₹${coupon.minOrderValue} required for this coupon`
      )
    }

    if (coupon.newUserOnly) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true }
      })

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      if (!user || user.createdAt < thirtyDaysAgo) {
        throw new Error('This coupon is only for new users')
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
        throw new Error('This coupon is only for first order')
      }
    }

    discount = calculateCouponDiscount(coupon, subtotal)

    if (discount <= 0) {
      throw new Error('Coupon does not apply to this order')
    }

    couponId = coupon.id
  }

  const taxableAmount = Math.round((subtotal - discount) * 100) / 100
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseValidation.warehouseId },
    select: { id: true, state: true }
  })

  let totalWeightedTax = 0
  let totalPrice = 0
  let avgTaxRate = DEFAULT_GST_RATE
  for (const item of cart.items) {
    if (!item.product?.isActive) continue
    const variant = item.productVariant
    if (variant && (!variant.isEnabled || variant.status !== 'ACTIVE')) continue
    const unitPrice = getCheckoutItemUnitPrice(item)
    const stock = variant ? (variant.stockQuantity ?? 0) : item.product.stock
    const qty = Math.min(item.quantity, stock)
    if (qty === 0) continue
    const itemPrice = unitPrice * qty
    const rate = item.product.taxRate ?? DEFAULT_GST_RATE
    totalPrice += itemPrice
    totalWeightedTax += itemPrice * rate
  }
  if (totalPrice > 0) avgTaxRate = totalWeightedTax / totalPrice

  const deliveryState = address ? getStateCode(address) : null
  const warehouseState = warehouse?.state ?? null
  const taxBreakdown = calculateTaxAfterDiscount(
    subtotal,
    discount,
    deliveryState,
    warehouseState,
    avgTaxRate
  )

  const orderValueForDelivery = taxableAmount + taxBreakdown.totalTax
  const pincode = address?.pincode ?? null
  const deliveryCharge = await getDeliveryChargeForOrder(
    warehouseValidation.warehouseId,
    deliveryType,
    orderValueForDelivery,
    pincode
  )

  const totalAmount =
    Math.round((taxableAmount + taxBreakdown.totalTax + deliveryCharge) * 100) / 100

  const orderNumber = await generateOrderNumber()

  const slotDateNormalized =
    deliveryType === 'SCHEDULED' && deliveryDate ? toUTCDateOnly(deliveryDate) : null

  if (deliveryType === 'SCHEDULED' && slotDateNormalized && deliverySlot) {
    if (isSlotStartInPast(slotDateNormalized, deliverySlot)) {
      throw new Error('This slot has already started. Please choose a later slot.')
    }
  }

  let scheduleRouteMapId = payload.routeMapId ?? null
  if (deliveryType === 'SCHEDULED' && resolvedAddressId) {
    const routeMapIds = await resolveRouteMapIdsForAddress(warehouseValidation.warehouseId, resolvedAddressId)
    if (scheduleRouteMapId != null && scheduleRouteMapId !== '') {
      if (!Array.isArray(routeMapIds) || !routeMapIds.includes(scheduleRouteMapId)) {
        throw new Error('This delivery slot is not available for your delivery address.')
      }
    } else {
      scheduleRouteMapId = null
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    let bookedSlotRow = null
    if (deliveryType === 'SCHEDULED' && slotDateNormalized) {
      bookedSlotRow = await bookDeliverySlotWithTx(
        tx,
        warehouseValidation.warehouseId,
        slotDateNormalized,
        deliverySlot,
        scheduleRouteMapId
      )
    }

    let reservedPickupSlotId = null
    if (deliveryType === 'PICKUP_STORE' && payloadPickupSlotId) {
      await reservePickupSlot(tx, payloadPickupSlotId)
      reservedPickupSlotId = payloadPickupSlotId
    }

    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        consumerId: userId,
        addressId: resolvedAddressId,
        warehouseId: warehouseValidation.warehouseId,
        deliveryType,
        deliverySlot: deliveryType === 'SCHEDULED' ? deliverySlot : null,
        deliveryDate: slotDateNormalized ?? null,
        deliverySlotId: bookedSlotRow?.id ?? null,
        routeMapId: deliveryType === 'SCHEDULED' ? scheduleRouteMapId : null,
        pickupStoreId: deliveryType === 'PICKUP_STORE' ? warehouseValidation.warehouseId : null,
        pickupTimeSlot: deliveryType === 'PICKUP_STORE' ? pickupTimeSlot : null,
        pickupSlotId: deliveryType === 'PICKUP_STORE' ? reservedPickupSlotId : null,
        totalAmount,
        deliveryCharge,
        discount,
        taxAmount: taxBreakdown.totalTax,
        cgst: taxBreakdown.cgst,
        sgst: taxBreakdown.sgst,
        igst: taxBreakdown.igst,
        taxableAmount,
        specialInstructions: specialInstructions || null,
        couponCode: couponToUse || null,
        couponId: couponId ?? null,
        couponDiscount: discount,
        status: orderStatus || 'PENDING'
      }
    })

    const warehouseStateForItems = warehouse?.state ?? null
    const deliveryStateForItems = address ? getStateCode(address) : null

    for (const cartItem of cart.items) {
      if (!cartItem.product?.isActive) continue
      const variant = cartItem.productVariant
      if (variant && (!variant.isEnabled || variant.status !== 'ACTIVE')) continue

      const unitPrice = getCheckoutItemUnitPrice(cartItem)
      const stock = variant ? (variant.stockQuantity ?? 0) : cartItem.product.stock
      const availableQuantity = Math.min(cartItem.quantity, stock)
      if (availableQuantity === 0) continue

      const itemSubtotal = Math.round(unitPrice * availableQuantity * 100) / 100
      const productTaxRate = cartItem.product.taxRate ?? DEFAULT_GST_RATE
      const itemTaxBreakdown = calculateGST(
        itemSubtotal,
        warehouseStateForItems,
        deliveryStateForItems,
        productTaxRate
      )
      const totalPrice = Math.round((itemSubtotal + itemTaxBreakdown.totalTax) * 100) / 100
      const productName = variant ? `${cartItem.product.name} (${variant.variantName})` : cartItem.product.name
      const productImage = (variant?.primaryImages?.length ? variant.primaryImages[0] : null) ?? cartItem.product.images?.[0] ?? null
      const orderItemUnit = mapProductUnitToStandardUnits((variant?.unit || cartItem.product.unit) ?? 'PIECE')

      await tx.orderItem.create({
        data: {
          orderId: newOrder.id,
          productId: cartItem.productId,
          productVariantId: cartItem.productVariantId ?? null,
          quantity: availableQuantity,
          unit: orderItemUnit,
          unitPrice,
          totalPrice,
          productName,
          productImage,
          mrp: variant?.mrp ?? cartItem.product.mrp,
          discount: 0,
          taxAmount: itemTaxBreakdown.totalTax,
          hsnCode: null,
          cgst: itemTaxBreakdown.cgst,
          sgst: itemTaxBreakdown.sgst,
          igst: itemTaxBreakdown.igst
        }
      })

      if (variant) {
        await tx.productVariant.update({
          where: { id: variant.id },
          data: { stockQuantity: { decrement: availableQuantity } }
        })
      } else {
        await tx.product.update({
          where: { id: cartItem.productId },
          data: { stock: { decrement: availableQuantity } }
        })
      }

      // Create Inventory Reservation for Partner Portal tracking (Production-Hardened)
      const location = await tx.inventoryLocation.findFirst({
        where: { warehouseId: warehouseValidation.warehouseId, isActive: true }
      });
      if (location) {
        // 1. Idempotency Check
        const existingRes = await tx.inventoryReservation.findFirst({
          where: {
            orderId: newOrder.id,
            productId: cartItem.productId,
            productVariantId: cartItem.productVariantId || null,
            locationId: location.id,
            status: 'PENDING'
          }
        });

        if (!existingRes) {
          // 2. Atomic DB-level reservation update
          const updateResult = await tx.unifiedInventory.updateMany({
            where: {
              productId: cartItem.productId,
              productVariantId: cartItem.productVariantId || null,
              locationId: location.id,
              available: { gte: availableQuantity }
            },
            data: {
              reserved: { increment: availableQuantity },
              available: { decrement: availableQuantity }
            }
          });

          if (updateResult.count === 0) {
            const unifiedExists = await tx.unifiedInventory.findFirst({
              where: {
                productId: cartItem.productId,
                productVariantId: cartItem.productVariantId || null,
                locationId: location.id
              }
            });

            if (!unifiedExists) {
              const stockVal = Math.max(cartItem.product?.stock || 0, availableQuantity);
              await tx.unifiedInventory.create({
                data: {
                  productId: cartItem.productId,
                  productVariantId: cartItem.productVariantId || null,
                  locationId: location.id,
                  onHand: stockVal,
                  reserved: availableQuantity,
                  available: Math.max(0, stockVal - availableQuantity)
                }
              });
            } else if ((cartItem.product?.stock || 0) >= availableQuantity) {
              const stockVal = cartItem.product.stock;
              await tx.unifiedInventory.update({
                where: { id: unifiedExists.id },
                data: {
                  onHand: Math.max(unifiedExists.onHand, stockVal),
                  reserved: { increment: availableQuantity },
                  available: Math.max(0, stockVal - availableQuantity)
                }
              });
            } else {
              throw new Error(`Insufficient available stock to reserve for product ${cartItem.productId}`);
            }
          }

          // 3. Create Reservation Entry
          await tx.inventoryReservation.create({
            data: {
              productId: cartItem.productId,
              productVariantId: cartItem.productVariantId || null,
              locationId: location.id,
              quantity: availableQuantity,
              status: 'PENDING',
              userId: userId,
              orderId: newOrder.id
            }
          });
        }
      }
    }

    await tx.payment.create({
      data: { orderId: newOrder.id, method: 'COD', amount: totalAmount, status: 'PENDING' }
    })

    await tx.delivery.create({
      data: { orderId: newOrder.id, status: 'PENDING' }
    })

    if (couponId) {
      await tx.couponRedemption.create({
        data: { userId, couponId, orderId: newOrder.id, discount }
      })
      await tx.coupon.update({
        where: { id: couponId },
        data: { totalUses: { increment: 1 } }
      })
    }

    return newOrder
  })

  logger.info('[OrderCreationService] Order created', {
    userId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    deliveryType,
    totalAmount: order.totalAmount
  })

  return {
    orderId: order.id,
    order,
    reusedExistingOrder: false,
    shouldClearCart: false
  }
}
