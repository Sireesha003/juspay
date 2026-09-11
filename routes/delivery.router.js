/**
 * Delivery API - Delivery types, slots (warehouse + date), charge calculation, pickup stores.
 * Single V1 API; slots use warehouse-scoped availability (Partner-configured or default).
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import { deliveryChargeValidation } from '../validations/deliveryValidation.js'
import { slotsAvailabilityValidation } from '../validations/ordersValidation.js'
import {
  calculateDeliveryChargePreview,
  getDeliveryTypes,
  getPickupStoresList,
  getPickupStoreSlots,
  getVillageSchedule,
  getServiceableVillages,
  getVillageScheduleDetail,
  getActiveBundles
} from '../controllers/deliveryController.js'
import { getAvailableSlots } from '../controllers/ordersController.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const router = express.Router()

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors)
  }
  next()
}

/**
 * GET /api/v1/delivery/slots
 * Get available delivery slots for a warehouse and date (same as orders/slots/availability).
 * Query: warehouseId (required), date (required, YYYY-MM-DD). Returns Partner-configured or default slots.
 */
router.get('/slots', slotsAvailabilityValidation, validate, getAvailableSlots)

/**
 * POST /api/v1/delivery/calculate-charge
 * Calculate delivery charge preview
 */
router.post('/calculate-charge', deliveryChargeValidation, validate, calculateDeliveryChargePreview)

/**
 * GET /api/v1/delivery/types
 * Get available delivery types with pricing
 */
router.get('/types', getDeliveryTypes)

/**
 * GET /api/v1/stores/pickup
 * Get available pickup stores
 */
router.get('/stores/pickup', getPickupStoresList)

/**
 * GET /api/v1/stores/:storeId/pickup-slots
 * Get pickup time slots for a store
 */
router.get('/stores/:storeId/pickup-slots', getPickupStoreSlots)

/**
 * GET /api/v1/delivery/schedule
 * Fetch delivery schedule for a village/pincode
 */
router.get('/schedule', authMiddleware, getVillageSchedule)

/**
 * GET /api/v1/delivery/schedule/villages
 * Fetch all serviceable villages
 */
router.get('/schedule/villages', authMiddleware, getServiceableVillages)

/**
 * GET /api/v1/delivery/schedule/detail
 * Fetch detailed village schedule configuration
 */
router.get('/schedule/detail', authMiddleware, getVillageScheduleDetail)

/**
 * GET /api/v1/delivery/bundles
 * Fetch active bundle deals
 */
router.get('/bundles', authMiddleware, getActiveBundles)

export default router

