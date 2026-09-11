/**
 * Single source of truth for order/delivery/payment lifecycle transitions (consumer-api).
 * Keep copies in sync across consumer, partner, and delivery APIs.
 */

/** @type {Record<string, string[]>} */
export const ORDER_TRANSITIONS = {
  PENDING: ['PLACED', 'PAYMENT_FAILED', 'CANCELLED', 'FAILED'],
  PAYMENT_FAILED: ['PENDING', 'PLACED', 'CANCELLED', 'FAILED'],
  PLACED: ['CONFIRMED', 'CANCELLED', 'FAILED'],
  CONFIRMED: ['ACCEPTED', 'PICKING', 'PACKING', 'PROCESSING', 'CANCELLED', 'FAILED'],
  ACCEPTED: ['PICKING', 'PACKING', 'PROCESSING', 'READY_FOR_PICKUP', 'CANCELLED', 'FAILED'],
  PICKING: ['PACKING', 'PROCESSING', 'READY_FOR_PICKUP', 'CANCELLED', 'FAILED'],
  PACKING: ['READY_FOR_PICKUP', 'PROCESSING', 'CANCELLED', 'FAILED'],
  PROCESSING: ['READY_FOR_PICKUP', 'CANCELLED', 'FAILED'],
  READY_FOR_PICKUP: ['ASSIGNED_TO_AGENT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED'],
  ASSIGNED_TO_AGENT: ['OUT_FOR_DELIVERY', 'ARRIVING_SOON', 'DELIVERED', 'FAILED'],
  OUT_FOR_DELIVERY: ['ARRIVING_SOON', 'DELIVERED', 'RETURN_INITIATED', 'FAILED', 'READY_FOR_PICKUP'],
  ARRIVING_SOON: ['DELIVERED', 'RETURN_INITIATED', 'FAILED'],
  DELIVERED: ['RETURN_INITIATED'],
  RETURN_INITIATED: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
  FAILED: ['RETURN_INITIATED']
}

/** Legacy API / sync payloads may still use pre-remap labels; map to persisted Order.status */
export const LEGACY_ORDER_STATUS_TO_CANONICAL = {
  PICKUP_OTP_PENDING: 'OUT_FOR_DELIVERY',
  PICKED_UP: 'OUT_FOR_DELIVERY',
  IN_TRANSIT: 'OUT_FOR_DELIVERY',
  ORDER_PLACED: 'PLACED',
  ORDER_CONFIRMED: 'CONFIRMED',
  PICKING_ITEMS: 'PICKING',
  PACKING_ORDER: 'PACKING',
  READY_FOR_DISPATCH: 'READY_FOR_PICKUP',
  DELIVERY_PARTNER_ASSIGNED: 'ASSIGNED_TO_AGENT'
}

export function canonicalOrderStatus(status) {
  if (!status) return status
  return LEGACY_ORDER_STATUS_TO_CANONICAL[status] || status
}

export function isLegacyDeliveryPhaseOrderStatus(status) {
  return Boolean(LEGACY_ORDER_STATUS_TO_CANONICAL[status] && LEGACY_ORDER_STATUS_TO_CANONICAL[status] === 'OUT_FOR_DELIVERY')
}

/** Partner assign flow still sends ASSIGNED_TO_AGENT in HTTP bodies */
export function isOrderAssignIntent(status) {
  return status === 'ASSIGNED_TO_AGENT' || status === 'OUT_FOR_DELIVERY'
}

export function validateOrderTransition(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) {
    return { valid: false, error: 'currentStatus and nextStatus are required' }
  }
  const from = canonicalOrderStatus(currentStatus)
  const to = canonicalOrderStatus(nextStatus)
  if (from === to) {
    return { valid: true, noOp: true }
  }
  const allowed = ORDER_TRANSITIONS[from] || []
  if (!allowed.includes(to)) {
    return {
      valid: false,
      error: `Invalid order transition ${from} -> ${to}. Allowed: ${allowed.join(', ') || 'none'}`
    }
  }
  return { valid: true, noOp: false }
}

/** @type {Record<string, string[]>} */
export const DELIVERY_TRANSITIONS = {
  PENDING: ['ASSIGNED'],
  ASSIGNED: ['ACCEPTED', 'REJECTED', 'FAILED'],
  REJECTED: ['ASSIGNED', 'PENDING'],
  ACCEPTED: ['PICKUP_OTP_PENDING', 'FAILED'],
  PICKUP_OTP_PENDING: ['PICKED_UP', 'FAILED'],
  PICKED_UP: ['IN_TRANSIT', 'FAILED'],
  IN_TRANSIT: ['DELIVERY_OTP_PENDING', 'RETURN_IN_TRANSIT', 'FAILED'],
  DELIVERY_OTP_PENDING: ['DELIVERED', 'FAILED'],
  DELIVERED: ['RETURN_IN_TRANSIT'],
  RETURN_IN_TRANSIT: ['RETURN_COMPLETED'],
  RETURN_COMPLETED: [],
  FAILED: ['ASSIGNED']
}

export function validateDeliveryLifecycleTransition(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) {
    return { valid: false, error: 'currentStatus and nextStatus are required' }
  }
  if (currentStatus === nextStatus) {
    return { valid: true, noOp: true }
  }
  const allowed = DELIVERY_TRANSITIONS[currentStatus] || []
  if (!allowed.includes(nextStatus)) {
    return {
      valid: false,
      error: `Invalid delivery transition ${currentStatus} -> ${nextStatus}. Allowed: ${allowed.join(', ') || 'none'}`
    }
  }
  return { valid: true, noOp: false }
}

/** @type {Record<string, string[]>} */
export const PAYMENT_TRANSITIONS = {
  INITIATED: ['PENDING', 'SUCCESS', 'FAILED'],
  PENDING: ['INITIATED', 'SUCCESS', 'FAILED'],
  SUCCESS: ['REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: [],
  REFUND_PENDING: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  REFUNDED: []
}

export function validatePaymentLifecycleTransition(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) {
    return { valid: false, error: 'currentStatus and nextStatus are required' }
  }
  if (currentStatus === nextStatus) {
    return { valid: true, noOp: true }
  }
  const allowed = PAYMENT_TRANSITIONS[currentStatus] || []
  if (!allowed.includes(nextStatus)) {
    return {
      valid: false,
      error: `Invalid payment transition ${currentStatus} -> ${nextStatus}. Allowed: ${allowed.join(', ') || 'none'}`
    }
  }
  return { valid: true, noOp: false }
}
