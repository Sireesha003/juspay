/**
 * VillagKart realtime contract — payload version for all socket events.
 * @see docs/realtime-socket-contract.md (generated in IMPLEMENTATION_SUMMARY)
 */
export const REALTIME_PAYLOAD_VERSION = 1

export const SOCKET_NAMESPACES = Object.freeze({
  consumer: '/consumer',
  delivery: '/delivery',
  partner: '/partner',
  admin: '/admin'
})

/** Logical name for order push dispatch logs (single-node: in-process, no BullMQ). */
export const NOTIFICATION_QUEUE_NAME = 'villagkart-order-notifications'

export const SOCKET_EVENTS = Object.freeze({
  consumer: {
    ORDER_STATUS_UPDATED: 'consumer:order_status_updated',
    RIDER_LOCATION_UPDATED: 'consumer:rider_location_updated',
    ORDER_CANCELLED: 'consumer:order_cancelled',
    NOTIFICATION: 'consumer:notification'
  },
  delivery: {
    NEW_ASSIGNMENT: 'delivery:new_assignment',
    ORDER_CANCELLED: 'delivery:order_cancelled',
    STATUS_UPDATED: 'delivery:status_updated',
    NOTIFICATION: 'delivery:notification'
  },
  partner: {
    NEW_ORDER: 'partner:new_order',
    ORDER_UPDATED: 'partner:order_updated',
    DELIVERY_ASSIGNED: 'partner:delivery_assigned'
  },
  admin: {
    ORDER_UPDATED: 'admin:order_updated',
    DELIVERY_TRACKING: 'admin:delivery_tracking',
    CRITICAL_ALERT: 'admin:critical_alert',
    SYNC_FAILURE: 'admin:sync_failure',
    QUEUE_FAILURE: 'admin:queue_failure',
    SOCKET_FAILURE: 'admin:socket_failure',
    DELIVERY_DELAY: 'admin:delivery_delay'
  }
})

export const roomUser = (userId) => `user:${userId}`
export const roomOrder = (orderId) => `order:${orderId}`
export const roomWarehouse = (warehouseId) => `warehouse:${warehouseId}`
export const roomDeliveryAgent = (agentId) => `delivery-agent:${agentId}`
export const roomAdminGlobal = () => 'admin:global'
