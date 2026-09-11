// config/queue.js
// Queue system - Redis/Bull removed, using synchronous execution instead
import logger from '../utils/logger.js'

// Create dummy queue instances that execute jobs synchronously
// These maintain the same interface but don't use Redis/Bull

const createDummyQueue = () => ({
  add: async (jobName, data, options) => {
    // Jobs are now executed synchronously via queueOrderStatusChange
    // This method is kept for compatibility but does nothing
    logger.debug('[Queue] Job execution moved to synchronous mode', {
      jobName,
      orderId: data?.orderId
    })
    return { id: 'sync-execution' }
  },
  process: () => {
    // No-op: processing is now synchronous
  },
  on: () => {
    // No-op: no event handlers needed
  },
  clean: async () => {
    // No-op: no cleanup needed
  }
})

const orderStatusQueue = createDummyQueue()
const notificationQueue = createDummyQueue()
const locationUpdateQueue = createDummyQueue()

// Redis is no longer available (removed)
const redisAvailable = false

logger.info('[Queue] Queue system initialized in synchronous mode (Redis removed)')

export {
  orderStatusQueue,
  notificationQueue,
  locationUpdateQueue,
  redisAvailable
}

export default {
  orderStatusQueue,
  notificationQueue,
  locationUpdateQueue,
  redisAvailable
}
