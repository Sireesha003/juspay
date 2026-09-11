import logger from './logger.js'

/**
 * Normalize warehouse id from query/header/body (string trim; reject empty).
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeWarehouseId(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  return s.length > 0 ? s : null
}

/**
 * Read warehouse id from Express request (query, body, x-warehouse-id header).
 * @param {import('express').Request} req
 * @returns {string | null}
 */
export function getWarehouseIdFromRequest(req) {
  return normalizeWarehouseId(
    req.query?.warehouseId ?? req.body?.warehouseId ?? req.headers?.['x-warehouse-id']
  )
}

/**
 * Log warehouse mismatch for cart debugging.
 * @param {{ userId?: string, context: string, requestedWarehouseId: string | null, actualWarehouseId: string | null, extra?: object }} p
 */
export function logCartWarehouseMismatch(p) {
  logger.warn('[Cart] Warehouse mismatch for cart', {
    context: p.context,
    userId: p.userId,
    requestedWarehouseId: p.requestedWarehouseId,
    actualWarehouseId: p.actualWarehouseId,
    ...p.extra
  })
}
