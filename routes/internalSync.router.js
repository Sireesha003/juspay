import express from 'express'
import { syncOrderStatusFromDelivery, syncOrderLocationFromDelivery } from '../controllers/internalSyncController.js'
import {
  internalRealtimeFanout,
  internalRealtimeLocationEmit
} from '../controllers/internalRealtimeController.js'
import { idempotencyMiddleware } from '../middlewares/idempotencyMiddleware.js'

const router = express.Router()

router.post('/order-sync/status', idempotencyMiddleware('internal-order-sync-status'), syncOrderStatusFromDelivery)
router.post('/order-sync/location', syncOrderLocationFromDelivery)
router.post('/realtime/fanout', internalRealtimeFanout)
router.post('/realtime/emit-location', internalRealtimeLocationEmit)

export default router
