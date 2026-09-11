// utils/orderStatusUtils.js
import logger from './logger.js'
import {
  validateOrderTransition,
  ORDER_TRANSITIONS
} from '../services/lifecycle/transitionRegistry.js'

/**
 * Backwards-compatible status transition check (delegates to transition registry).
 */
export function validateStatusTransition(currentStatus, newStatus) {
  const r = validateOrderTransition(currentStatus, newStatus)
  if (r.valid) {
    return { valid: true, message: r.noOp ? 'Status unchanged' : undefined }
  }
  logger.warn('[OrderStatus] Invalid status transition', { currentStatus, newStatus, error: r.error })
  return { valid: false, error: r.error }
}

/** Valid Prisma OrderStatus enum values that can be cancelled */
export const PRISMA_CANCELLABLE_STATUSES = [
  'PENDING',
  'PAYMENT_FAILED',
  'PLACED',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'READY_FOR_PICKUP',
  'CREATED',
  'PAID',
  'ALLOCATED',
  'ASSIGNED'
]

export const CANCELLABLE_ORDER_STATUSES = [
  ...PRISMA_CANCELLABLE_STATUSES,
  'ORDER_PLACED',
  'ORDER PLACED',
  'ORDER_CONFIRMED',
  'ORDER CONFIRMED',
  'PICKING_ITEMS',
  'PICKING ITEMS',
  'PACKING_ORDER',
  'PACKING ORDER',
  'READY_FOR_DISPATCH',
  'READY FOR DISPATCH'
]

export function canCancelOrder(status) {
  if (!status) return false
  const upper = status.toUpperCase()
  return CANCELLABLE_ORDER_STATUSES.includes(upper)
}

export function isTerminalState(status) {
  return ['DELIVERED', 'CANCELLED', 'RETURNED'].includes(status)
}

export function getNextValidStatuses(currentStatus) {
  return ORDER_TRANSITIONS[currentStatus] || []
}
