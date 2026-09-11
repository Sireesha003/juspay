import crypto from 'crypto'
import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'
import { sendPushNotification } from '../utils/notificationUtils.js'
import { NOTIFICATION_QUEUE_NAME, SOCKET_EVENTS } from '../constants/realtimeEvents.js'

function stableJobId(orderId, status, eventId) {
  const raw = `${orderId}|${status}|${eventId || 'na'}`
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64)
}

export async function getOrderNotificationQueueHealth() {
  return {
    ok: true,
    skipped: true,
    reason: 'SINGLE_NODE_IN_PROCESS_DISPATCH',
    note: 'FCM order pushes run via setImmediate on this process; no BullMQ'
  }
}

const TEMPLATES = {
  PLACED: { title: 'Order placed', type: 'ORDER_PLACED' },
  CONFIRMED: { title: 'Order accepted', type: 'ORDER_ACCEPTED' },
  PROCESSING: { title: 'Order preparing', type: 'ORDER_PREPARING' },
  READY_FOR_PICKUP: { title: 'Ready for pickup', type: 'ORDER_READY' },
  OUT_FOR_DELIVERY: { title: 'Out for delivery', type: 'ORDER_OUT_FOR_DELIVERY' },
  DELIVERED: { title: 'Delivered', type: 'ORDER_DELIVERED' },
  CANCELLED: { title: 'Order cancelled', type: 'ORDER_CANCELLED' },
  FAILED: { title: 'Delivery issue', type: 'ORDER_FAILED' },
  RETURN_INITIATED: { title: 'Return initiated', type: 'ORDER_RETURN' },
  RETURNED: { title: 'Returned', type: 'ORDER_RETURNED' }
}

/**
 * @param {object} data
 * @param {string} jobIdForLog
 */
export async function processConsumerOrderPushData(data, jobIdForLog) {
  const { orderId, status, eventId, source } = data || {}
  const tpl = TEMPLATES[status]
  if (!tpl) {
    logger.debug('[NotifyDispatch] no template for status', { status })
    return { skipped: true }
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      consumerId: true,
      status: true
    }
  })
  if (!order) return { skipped: true, reason: 'ORDER_NOT_FOUND' }

  const idempotencyKey = `fcm:${order.consumerId}:${orderId}:${status}:${eventId || 'none'}`

  const existing = await prisma.notificationDispatchLog.findFirst({
    where: { idempotencyKey, status: 'SENT' },
    select: { id: true }
  })
  if (existing) return { deduped: true }

  const devices = await prisma.deviceToken.findMany({
    where: { userId: order.consumerId },
    select: { deviceToken: true }
  })

  let sent = 0
  let lastErr = null
  let lastMid = null
  for (const d of devices) {
    const r = await sendPushNotification(
      d.deviceToken,
      tpl.title,
      `Order ${order.orderNumber} — ${tpl.title.toLowerCase()}.`,
      {
        type: tpl.type,
        orderId: order.id,
        orderNumber: order.orderNumber || '',
        status: String(status),
        source: source || '',
        eventId: eventId || ''
      },
      order.consumerId
    )
    if (r?.success) {
      sent += 1
      lastMid = r.messageId
    } else {
      lastErr = r?.error || 'send_failed'
    }
  }

  await prisma.notificationDispatchLog.create({
    data: {
      idempotencyKey,
      type: tpl.type,
      recipientUserId: order.consumerId,
      orderId,
      status: sent > 0 ? 'SENT' : devices.length ? 'FAILED' : 'SKIPPED',
      fcmMessageId: lastMid ? String(lastMid) : null,
      error: sent > 0 ? null : lastErr || 'no_devices',
      correlationId: eventId || null,
      sourceService: source || 'CONSUMER_API_DISPATCH',
      payload: { orderNumber: order.orderNumber, status }
    }
  })

  await prisma.notificationQueueLog.create({
    data: {
      jobId: jobIdForLog,
      jobName: 'consumer-order-push',
      status: 'COMPLETED',
      payload: data,
      completedAt: new Date()
    }
  })

  return { sent, devices: devices.length }
}

export async function enqueueOrderNotificationJob(data) {
  const jobId = stableJobId(data.orderId, data.status, data.eventId)
  setImmediate(() => {
    void (async () => {
      try {
        await processConsumerOrderPushData(data, jobId)
      } catch (e) {
        logger.error('[NotifyDispatch] failed', { message: e.message, jobId, orderId: data?.orderId })
        try {
          const { emitAdminOperationalEvent } = await import('../config/socket.js')
          await emitAdminOperationalEvent(SOCKET_EVENTS.admin.QUEUE_FAILURE, {
            jobId,
            orderId: data?.orderId,
            status: data?.status,
            error: e?.message
          })
        } catch (err) {
          logger.warn('[NotifyDispatch] admin operational emit failed', { message: err.message })
        }
      }
    })()
  })
  return jobId
}

export function startOrderNotificationWorker() {
  logger.info('[NotifyDispatch] single-node mode — no BullMQ worker', { queue: NOTIFICATION_QUEUE_NAME })
}

export async function stopOrderNotificationWorker() {
  /* no-op: in-process dispatch only */
}
