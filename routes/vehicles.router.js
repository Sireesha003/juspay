import express from 'express'
import {
  getVehiclesByWarehouse,
  getVehicleTrackingData
} from '../controllers/vehiclesController.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const router = express.Router()

/**
 * GET ALL VEHICLES BY WAREHOUSE
 * GET /api/v1/vehicles?warehouseId=...
 */
router.get('/', authMiddleware, getVehiclesByWarehouse)
router.get('/:id/track', authMiddleware, getVehicleTrackingData)

export default router
