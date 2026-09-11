/**
 * Coupon type normalization — DB stores arbitrary String; unify to uppercase enums.
 */

export const COUPON_TYPE = Object.freeze({
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED'
})

/**
 * @param {string | null | undefined} type
 * @returns {typeof COUPON_TYPE[keyof typeof COUPON_TYPE] | null}
 */
export function normalizeCouponType(type) {
  if (type == null || type === '') return null
  const s = String(type).trim().toUpperCase()
  if (s === 'PERCENTAGE' || s === 'PERCENT') return COUPON_TYPE.PERCENTAGE
  if (s === 'RUPEES' || s === 'FLAT' || s === 'FLAT') return COUPON_TYPE.FIXED
  const lower = String(type).trim().toLowerCase()
  if (lower === 'percentage') return COUPON_TYPE.PERCENTAGE
  if (lower === 'rupees') return COUPON_TYPE.FIXED
  return null
}

/**
 * Shared discount calculation — use everywhere cart/order reference coupon.value.
 * @param {{ type: string, value: number, minOrderValue?: number|null, maxDiscount?: number|null }} coupon
 * @param {number} cartValue
 */
export function calculateCouponDiscount(coupon, cartValue) {
  console.log('Calculating coupon discount', { "cartValue": cartValue })
  if (!couponValuePositive(cartValue)) return 0
  console.log('Cart value is positive, proceeding with discount calculation')
  const minOrderValue = coupon.minOrderValue || 0
  console.log('Minimum order value for coupon', { minOrderValue })
  if (cartValue < minOrderValue) return 0

  console.log('Calculating discount for coupon', { coupon, cartValue })
  console.log('Coupon type before normalization', { originalType: coupon.type })
  const t = normalizeCouponType(coupon.type)
  console.log('Normalized coupon type', { normalizedType: t })
  let discount = 0
  if (t === COUPON_TYPE.PERCENTAGE) {
    discount = (cartValue * coupon.value) / 100
    if (coupon.maxDiscount != null && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount
    }
  } else if (t === COUPON_TYPE.FIXED) {
    discount = Math.min(coupon.value, cartValue)
  }

  return Math.round(discount * 100) / 100
}

function couponValuePositive(cartValue) {
  return cartValue != null && cartValue > 0
}
