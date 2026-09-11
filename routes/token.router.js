import express from 'express'
import { validationResult } from 'express-validator'
import { updateToken } from '../controllers/authController.js'
import { updateTokenValidation } from '../validations/authValidation.js'
import { validationErrorResponse } from '../utils/responseHelper.js'
import { optionalAuth } from '../middlewares/optionalAuthMiddleware.js'
import {
  applyJwtUserIdToUpdateTokenBody,
  deriveDeviceIdForUpdateTokenIfMissing
} from '../middlewares/prepareUpdateTokenRequest.js'

const router = express.Router()

const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors)
  }
  next()
}

router.post(
  '/updateToken',
  optionalAuth,
  applyJwtUserIdToUpdateTokenBody,
  deriveDeviceIdForUpdateTokenIfMissing,
  updateTokenValidation,
  validate,
  updateToken
)

export default router
