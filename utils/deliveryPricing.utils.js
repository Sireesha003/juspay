// utils/deliveryPricing.utils.js
// Delivery pricing by DeliveryType. Used by order creation (create order from cart).

const FREE_DELIVERY_THRESHOLD = 500

const DELIVERY_CHARGE_BY_TYPE = {
  FAST: 20,
  SCHEDULED: 10,
  PICKUP_STORE: 0
}

/**
 * Calculate delivery charge by delivery type (FAST | SCHEDULED | PICKUP_STORE).
 *
 * @param {string} deliveryType - 'FAST' | 'SCHEDULED' | 'PICKUP_STORE'
 * @param {number} orderValue - Order value (e.g. taxable amount + tax)
 * @returns {number} Delivery charge in rupees
 */
export function calculateDeliveryChargeByType(deliveryType, orderValue) {
  if (deliveryType === 'PICKUP_STORE') {
    return 0
  }

  const baseCharge = DELIVERY_CHARGE_BY_TYPE[deliveryType] ?? DELIVERY_CHARGE_BY_TYPE.FAST
  if (deliveryType !== 'FAST' && orderValue >= FREE_DELIVERY_THRESHOLD) {
    return 0
  }
  return baseCharge
}

export { FREE_DELIVERY_THRESHOLD, DELIVERY_CHARGE_BY_TYPE }
