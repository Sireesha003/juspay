/**
 * Classify cart lines for warehouse consistency and catalog validity.
 * Used to align GET cart responses with totals and to prune stale lines.
 */

/** @typedef {'INACTIVE_PRODUCT'|'EXPIRED_DEAL'|'UNAVAILABLE_VARIANT'|'WAREHOUSE_MISMATCH'|'MISSING_PRODUCT'} CartLineInvalidReason */

/**
 * @param {object} item - cart line with product (+ optional productVariant)
 * @param {string | null} warehouseId - requested cart warehouse
 * @returns {{ valid: boolean, reason?: CartLineInvalidReason }}
 */
export function classifyCartLine(item, warehouseId) {
  if (!item?.product) {
    return { valid: false, reason: 'MISSING_PRODUCT' }
  }
  if (!item.product.isActive || (item.product.status && item.product.status !== 'APPROVED')) {
    return { valid: false, reason: 'INACTIVE_PRODUCT' }
  }
  if (item.product.flashDealEnd && new Date(item.product.flashDealEnd) <= new Date()) {
    return { valid: false, reason: 'EXPIRED_DEAL' }
  }
  if (
    item.productVariant &&
    (!item.productVariant.isEnabled || item.productVariant.status !== 'ACTIVE')
  ) {
    return { valid: false, reason: 'UNAVAILABLE_VARIANT' }
  }
  if (
    warehouseId &&
    item.product.warehouseId &&
    item.product.warehouseId !== warehouseId
  ) {
    return { valid: false, reason: 'WAREHOUSE_MISMATCH' }
  }
  return { valid: true }
}

/**
 * @param {Array<object>} items
 * @param {string | null} warehouseId
 */
export function partitionCartLines(items, warehouseId) {
  const valid = []
  const invalid = []
  for (const item of items) {
    const c = classifyCartLine(item, warehouseId)
    if (c.valid) valid.push(item)
    else invalid.push({ item, reason: c.reason })
  }
  return { valid, invalid }
}
