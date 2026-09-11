import { errorResponse } from '../utils/responseHelper.js'
import { getWarehouseIdFromRequest } from '../utils/cartWarehouseUtils.js'

/**
 * Resolves and attaches normalized warehouseId for cart routes.
 * @type {import('express').RequestHandler}
 */
export function resolveCartWarehouse(req, res, next) {
  req.normalizedWarehouseId = getWarehouseIdFromRequest(req)
  next()
}

/**
 * Requires warehouseId (query, body, or x-warehouse-id). Use after resolveCartWarehouse.
 * @type {import('express').RequestHandler}
 */
export function requireCartWarehouse(req, res, next) {
  if (!req.normalizedWarehouseId) {
    return errorResponse(
      res,
      400,
      'warehouseId is required (query, body, or x-warehouse-id header)'
    )
  }
  next()
}
