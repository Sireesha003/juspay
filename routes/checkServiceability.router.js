/**
 * POST /api/v1/check-serviceability
 * Validates pincode against a chosen warehouse for checkout.
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import { checkWarehouseServiceabilityValidation } from '../validations/checkWarehouseServiceabilityValidation.js'
import { checkWarehousePincodeServiceability } from '../controllers/serviceabilityController.js'

const router = express.Router()

const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors)
  }
  next()
}

router.post(
  '/',
  checkWarehouseServiceabilityValidation,
  validate,
  checkWarehousePincodeServiceability
)

export default router
