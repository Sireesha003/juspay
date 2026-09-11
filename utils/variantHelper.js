/**
 * Product variant mapping for API responses.
 * Used across all product fetch endpoints; backward compatible (adds variants array only).
 */

const ACTIVE_VARIANT_WHERE = {
  status: 'ACTIVE',
  isEnabled: true,
  stockQuantity: { gt: 0 }
}

/**
 * Prisma include for variants (ACTIVE & isEnabled only with stock > 0). Use in product findMany/findUnique.
 */
export const variantsInclude = {
  variants: {
    where: ACTIVE_VARIANT_WHERE,
    select: {
      id: true,
      sku: true,
      gtin: true,
      variantName: true,
      unit: true,
      unitType: true,
      measurement: true,
      mrp: true,
      sellingPrice: true,
      stockQuantity: true,
      minOrderQty: true,
      maxOrderQty: true,
      lowStockThreshold: true,
      primaryImages: true,
      secondaryImages: true,
      isEnabled: true,
      status: true,
      ProductTierPrice: {
        where: { isActive: true },
        select: { minQuantity: true, maxQuantity: true, price: true }
      }
    }
  },
  ProductTierPrice: {
    where: { isActive: true, productVariantId: null },
    select: { minQuantity: true, maxQuantity: true, price: true }
  }
}

/**
 * Minimal variant select for suggestions endpoint.
 */
export const variantsIncludeMinimal = {
  variants: {
    where: ACTIVE_VARIANT_WHERE,
    select: {
      id: true,
      variantName: true,
      unit: true,
      mrp: true,
      sellingPrice: true,
      stockQuantity: true
    }
  }
}

/**
 * Map variant rows to API shape (full). Use for list/detail/popular/offers.
 * Filters out any variants with 0 stock.
 * @param {Array} variants - Array of variant objects from Prisma (or undefined)
 * @returns {Array}
 */
export function mapVariants(variants) {
  if (!Array.isArray(variants) || variants.length === 0) return []

  return variants
    .filter((v) => (v.stockQuantity != null ? Math.max(0, parseInt(v.stockQuantity, 10) || 0) : 0) > 0)
    .map((v) => {
      const stockQty = Math.max(0, parseInt(v.stockQuantity, 10) || 0)
      const inStock = stockQty > 0
      const isOutOfStock = !inStock
      const isAvailable = inStock && v.isEnabled !== false && v.status !== 'INACTIVE'
      const status = isOutOfStock ? 'OUT_OF_STOCK' : (v.status || 'ACTIVE')

      return {
        id: v.id,
        sku: v.sku,
        gtin: v.gtin,
        name: v.variantName,
        variantName: v.variantName,
        unit: v.unit,
        unitType: v.unitType,
        measurement: v.measurement,
        mrp: v.mrp,
        price: v.sellingPrice ?? v.mrp,
        sellingPrice: v.sellingPrice ?? v.mrp,
        discount:
          v.mrp && v.sellingPrice != null && v.sellingPrice < v.mrp
            ? Math.round(((v.mrp - v.sellingPrice) / v.mrp) * 100)
            : 0,
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
        minOrderQty: v.minOrderQty ?? 1,
        maxOrderQty: v.maxOrderQty ?? null,
        lowStockThreshold: v.lowStockThreshold ?? 5,
        images: [...(v.primaryImages || []), ...(v.secondaryImages || [])],
        primaryImages: v.primaryImages || [],
        secondaryImages: v.secondaryImages || [],
        isEnabled: v.isEnabled ?? true,
        status: status,
        rawStatus: v.status || 'ACTIVE',
        tierPrices: v.ProductTierPrice || []
      }
    })
}

/**
 * Map variant rows to minimal API shape (suggestions only).
 * Filters out any variants with 0 stock.
 */
export function mapVariantsMinimal(variants) {
  if (!Array.isArray(variants) || variants.length === 0) return []

  return variants
    .filter((v) => (v.stockQuantity != null ? Math.max(0, parseInt(v.stockQuantity, 10) || 0) : 0) > 0)
    .map((v) => {
      const stockQty = Math.max(0, parseInt(v.stockQuantity, 10) || 0)
      const inStock = stockQty > 0
      const isOutOfStock = !inStock
      const isAvailable = inStock && v.isEnabled !== false && v.status !== 'INACTIVE'
      const status = isOutOfStock ? 'OUT_OF_STOCK' : (v.status || 'ACTIVE')

      return {
        id: v.id,
        name: v.variantName,
        variantName: v.variantName,
        unit: v.unit,
        mrp: v.mrp,
        price: v.sellingPrice ?? v.mrp,
        sellingPrice: v.sellingPrice ?? v.mrp,
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
        status: status
      }
    })
}
