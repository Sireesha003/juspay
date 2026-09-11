// utils/cartValidation.js
import { prisma } from '../config/prismaClient.js'
import logger from './logger.js'

/**
 * Validate cart before checkout
 * 
 * @param {Array} cartItems - Cart items to validate
 * @param {string} addressId - Optional delivery address ID
 * @returns {Promise<Object>} Validation result with issues and warnings
 */
export async function validateCart(cartItems, addressId = null) {
  const issues = []
  const warnings = []
  let isValid = true

  if (!cartItems || cartItems.length === 0) {
    return {
      valid: false,
      issues: [{ type: 'EMPTY_CART', message: 'Cart is empty' }],
      warnings: []
    }
  }

  for (const item of cartItems) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: {
        id: true,
        name: true,
        price: true,
        finalPrice: true,
        stock: true,
        isActive: true,
        warehouseId: true
      }
    })

    if (!product) {
      issues.push({
        type: 'PRODUCT_NOT_FOUND',
        productId: item.productId,
        message: 'Product not found'
      })
      isValid = false
      continue
    }

    if (!product.isActive) {
      issues.push({
        type: 'PRODUCT_INACTIVE',
        productId: item.productId,
        productName: product.name,
        message: 'Product is no longer available'
      })
      isValid = false
      continue
    }

    const baseProductPrice =
      product.finalPrice != null ? Number(product.finalPrice) : Number(product.price)
    let unitPrice = baseProductPrice
    let availableStock = product.stock
    let displayName = product.name
    let variantId = item.productVariantId

    if (variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: variantId, productId: item.productId },
        select: {
          id: true,
          variantName: true,
          sellingPrice: true,
          mrp: true,
          stockQuantity: true,
          status: true,
          isEnabled: true
        }
      })
      if (!variant) {
        issues.push({
          type: 'VARIANT_NOT_FOUND',
          productId: item.productId,
          productVariantId: variantId,
          message: 'Product variant not found or does not belong to this product'
        })
        isValid = false
        continue
      }
      if (variant.status !== 'ACTIVE' || !variant.isEnabled) {
        issues.push({
          type: 'VARIANT_UNAVAILABLE',
          productId: item.productId,
          productVariantId: variantId,
          productName: product.name,
          variantName: variant.variantName,
          message: 'This variant is not available'
        })
        isValid = false
        continue
      }
      unitPrice =
        variant.sellingPrice != null
          ? Number(variant.sellingPrice)
          : (variant.mrp != null ? Number(variant.mrp) : baseProductPrice)
      availableStock = variant.stockQuantity ?? 0
      displayName = `${product.name} (${variant.variantName})`
    }

    if (availableStock < item.quantity) {
      issues.push({
        type: 'OUT_OF_STOCK',
        productId: item.productId,
        productVariantId: variantId ?? undefined,
        productName: displayName,
        requested: item.quantity,
        available: availableStock,
        message: `Only ${availableStock} units available`
      })
      isValid = false
    } else if (availableStock < item.quantity + 5) {
      warnings.push({
        type: 'LOW_STOCK',
        productId: item.productId,
        productVariantId: variantId ?? undefined,
        productName: displayName,
        available: availableStock,
        message: 'Low stock available'
      })
    }

    if (item.snapshotPrice != null && item.snapshotPrice !== unitPrice) {
      const priceDifference = unitPrice - item.snapshotPrice
      const priceChangePercent = ((priceDifference / item.snapshotPrice) * 100).toFixed(2)

      if (Math.abs(Number(priceChangePercent)) > 10) {
        issues.push({
          type: 'PRICE_CHANGED_SIGNIFICANTLY',
          productId: item.productId,
          productVariantId: variantId ?? undefined,
          productName: displayName,
          oldPrice: item.snapshotPrice,
          newPrice: unitPrice,
          difference: priceDifference,
          percentChange: priceChangePercent,
          message: `Price changed by ${priceChangePercent}%`
        })
        isValid = false
      } else {
        warnings.push({
          type: 'PRICE_CHANGED',
          productId: item.productId,
          productVariantId: variantId ?? undefined,
          productName: displayName,
          oldPrice: item.snapshotPrice,
          newPrice: unitPrice,
          difference: priceDifference,
          percentChange: priceChangePercent,
          message: `Price changed by ${priceChangePercent}%`
        })
      }
    }
  }

  const warehouseIds = new Set()
  for (const item of cartItems) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { warehouseId: true }
    })
    if (product?.warehouseId) {
      warehouseIds.add(product.warehouseId)
    }
  }

  if (warehouseIds.size > 1) {
    issues.push({
      type: 'MIXED_WAREHOUSE',
      message: 'All items must be from the same warehouse',
      warehouseIds: Array.from(warehouseIds)
    })
    isValid = false
  }

  // Validate delivery address serviceability if provided
  if (addressId) {
    const address = await prisma.address.findUnique({
      where: { id: addressId },
      select: { pincode: true, state: true }
    })

    if (address && warehouseIds.size === 1) {
      const warehouseId = Array.from(warehouseIds)[0]
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { servicePincodes: true }
      })

      if (warehouse && warehouse.servicePincodes.length > 0) {
        if (!warehouse.servicePincodes.includes(address.pincode)) {
          warnings.push({
            type: 'PINCODE_NOT_SERVICEABLE',
            pincode: address.pincode,
            message: 'Delivery may not be available for this pincode'
          })
        }
      }
    }
  }

  return {
    valid: isValid,
    issues,
    warnings
  }
}

