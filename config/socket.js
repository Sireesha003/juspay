// config/socket.js — multi-namespace Socket.IO (single-node, in-memory) + internal HTTP fan-in
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import config from './config.js'
import logger from '../utils/logger.js'
import { verifyToken, getJwtVerifyOptions } from '../utils/jwtUtils.js'
import { prisma } from './prismaClient.js'
import {
  REALTIME_PAYLOAD_VERSION,
  SOCKET_NAMESPACES,
  SOCKET_EVENTS,
  roomUser,
  roomOrder,
  roomWarehouse,
  roomDeliveryAgent,
  roomAdminGlobal,
} from '../constants/realtimeEvents.js'
import { acquireFanoutLock } from '../services/realtime/fanoutCorrelationDedupe.js'
import { safeParseFanoutEnvelope } from '../services/orchestration/schemas.js'
import { incCounter } from '../services/metrics/realtimeMetrics.js'

let ioRoot = null
const SERVER_INSTANCE_ID = process.env.HOSTNAME || process.env.K8S_POD_NAME || randomUUID()

export function isSocketInitialized() {
  return Boolean(ioRoot)
}

const ADMIN_OPERATIONAL_EVENTS = new Set([
  SOCKET_EVENTS.admin.CRITICAL_ALERT,
  SOCKET_EVENTS.admin.SYNC_FAILURE,
  SOCKET_EVENTS.admin.QUEUE_FAILURE,
  SOCKET_EVENTS.admin.SOCKET_FAILURE,
  SOCKET_EVENTS.admin.DELIVERY_DELAY
])

/**
 * Operational admin-only events (monitoring / NOC). Payload is validated as object only.
 */
export async function emitAdminOperationalEvent(eventName, payload = {}) {
  if (!ioRoot || !ADMIN_OPERATIONAL_EVENTS.has(eventName)) {
    logger.warn('[Socket] emitAdminOperationalEvent rejected', { eventName })
    return
  }
  const body = {
    v: REALTIME_PAYLOAD_VERSION,
    event: eventName,
    timestamp: new Date().toISOString(),
    ...payload
  }
  try {
    ioRoot.of(SOCKET_NAMESPACES.admin).to(roomAdminGlobal()).emit(eventName, body)
    incCounter('socket_admin_operational_emit')
  } catch (e) {
    logger.error('[Socket] admin operational emit failed', { message: e.message, eventName })
  }
}

const NS = SOCKET_NAMESPACES

const ROLE_SETS = {
  [NS.consumer]: new Set(['CONSUMER', 'SUPER_ADMIN', 'OPERATIONAL_ADMIN']),
  [NS.delivery]: new Set(['DELIVERY_AGENT', 'SUPER_ADMIN', 'OPERATIONAL_ADMIN']),
  [NS.partner]: new Set([
    'PARTNER',
    'OWNER',
    'MANAGER',
    'WAREHOUSE_STAFF',
    'VENDOR',
    'SUPPLIER',
    'DIRECTOR',
    'SUPER_ADMIN',
    'OPERATIONAL_ADMIN'
  ]),
  [NS.admin]: new Set(['SUPER_ADMIN', 'OPERATIONAL_ADMIN', 'ADMIN'])
}

function deliveryJwtPublicKey() {
  const pem = process.env.SOCKET_DELIVERY_JWT_PUBLIC_KEY || process.env.DELIVERY_JWT_PUBLIC_KEY
  if (pem) return pem.replace(/\\n/g, '\n')
  return config.jwt.publicKey
}

function verifyDeliveryToken(token) {
  const publicKey = deliveryJwtPublicKey()
  const opts = { algorithms: [config.jwt.algorithm] }
  if (process.env.DELIVERY_JWT_ISSUER) opts.issuer = process.env.DELIVERY_JWT_ISSUER
  if (process.env.DELIVERY_JWT_AUDIENCE) opts.audience = process.env.DELIVERY_JWT_AUDIENCE
  try {
    return jwt.verify(token, publicKey, opts)
  } catch (e) {
    if (process.env.SOCKET_JWT_RELAXED === 'true') {
      return jwt.verify(token, publicKey, { algorithms: [config.jwt.algorithm] })
    }
    throw e
  }
}

function verifyPartnerToken(token) {
  const publicKey =
    (process.env.SOCKET_PARTNER_JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n') || config.jwt.publicKey
  return jwt.verify(token, publicKey, { algorithms: [config.jwt.algorithm] })
}

function decodeHandshakeToken(namespace, token) {
  if (namespace === NS.consumer) {
    return verifyToken(token)
  }
  if (namespace === NS.delivery) {
    return verifyDeliveryToken(token)
  }
  if (namespace === NS.partner) {
    return verifyPartnerToken(token)
  }
  if (namespace === NS.admin) {
    return verifyToken(token)
  }
  throw new Error('Unknown namespace')
}

async function assertUserActive(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true }
  })
  if (!user || !user.isActive) {
    throw new Error('User not found or inactive')
  }
}

function attachNamespaceAuth(namespace) {
  ioRoot.of(namespace).use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '')
      if (!token) return next(new Error('Authentication error: No token provided'))
      const decoded = decodeHandshakeToken(namespace, token)
      if (!decoded?.id || !decoded?.role) {
        return next(new Error('Authentication error: Invalid token claims'))
      }
      if (!ROLE_SETS[namespace].has(decoded.role)) {
        return next(new Error('Authentication error: Role not allowed for this namespace'))
      }
      await assertUserActive(decoded.id)
      socket.userId = decoded.id
      socket.userRole = decoded.role
      next()
    } catch (error) {
      logger.warn('[Socket] Auth failed', { namespace, message: error.message })
      next(new Error('Authentication error: Invalid token'))
    }
  })
}

async function recordSocketSession(namespace, userId, socketId, connect) {
  try {
    if (connect) {
      await prisma.socketSession.create({
        data: {
          userId,
          namespace,
          socketId,
          serverInstanceId: SERVER_INSTANCE_ID
        }
      })
    } else {
      await prisma.socketSession.updateMany({
        where: { socketId, disconnectedAt: null },
        data: { disconnectedAt: new Date() }
      })
    }
  } catch (e) {
    logger.warn('[Socket] session audit skipped', { message: e.message })
  }
}

async function handleSocketSubscribe(socket, namespace, payload, ack) {
  try {
    const orderId = payload?.orderId
    const warehouseId = payload?.warehouseId
    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          consumerId: true,
          agentId: true,
          warehouseId: true
        }
      })
      if (!order) {
        socket.emit('error', { message: 'Order not found' })
        return typeof ack === 'function' && ack({ ok: false, error: 'NOT_FOUND' })
      }
      let allowed =
        order.consumerId === socket.userId ||
        order.agentId === socket.userId ||
        socket.userRole === 'SUPER_ADMIN' ||
        socket.userRole === 'OPERATIONAL_ADMIN'
      if (!allowed && namespace === NS.partner && order.warehouseId) {
        const link = await prisma.user.findFirst({
          where: { id: socket.userId, warehouseId: order.warehouseId },
          select: { id: true }
        })
        allowed = Boolean(link)
      }
      if (!allowed) {
        logger.warn('[Socket] subscribe denied', {
          namespace,
          userId: socket.userId,
          role: socket.userRole,
          orderId,
          warehouseId,
          reason: 'ORDER_OR_ROLE'
        })
        socket.emit('error', { message: 'Access denied' })
        return typeof ack === 'function' && ack({ ok: false, error: 'FORBIDDEN' })
      }
      socket.join(roomOrder(orderId))
    }
    if (warehouseId && namespace === NS.partner) {
      const link = await prisma.user.findFirst({
        where: { id: socket.userId, warehouseId },
        select: { id: true }
      })
      if (!link && socket.userRole !== 'SUPER_ADMIN' && socket.userRole !== 'OPERATIONAL_ADMIN') {
        socket.emit('error', { message: 'Warehouse access denied' })
        return typeof ack === 'function' && ack({ ok: false, error: 'FORBIDDEN' })
      }
      socket.join(roomWarehouse(warehouseId))
    }
    if (payload?.agentId && namespace === NS.delivery) {
      if (payload.agentId !== socket.userId && socket.userRole !== 'SUPER_ADMIN') {
        socket.emit('error', { message: 'Agent room denied' })
        return typeof ack === 'function' && ack({ ok: false, error: 'FORBIDDEN' })
      }
      socket.join(roomDeliveryAgent(payload.agentId))
    }
    if (namespace === NS.admin) {
      socket.join(roomAdminGlobal())
    }
    if (typeof ack === 'function') ack({ ok: true })
  } catch (e) {
    logger.error('[Socket] subscribe error', { message: e.message })
    if (typeof ack === 'function') ack({ ok: false, error: 'INTERNAL' })
  }
}

function registerNamespaceHandlers(namespace) {
  ioRoot.of(namespace).on('connection', (socket) => {
    logger.info('[Socket] connected', {
      namespace,
      socketId: socket.id,
      userId: socket.userId,
      role: socket.userRole
    })
    void recordSocketSession(namespace, socket.userId, socket.id, true)

    socket.join(roomUser(socket.userId))

    socket.on('ping', (cb) => {
      if (typeof cb === 'function') cb({ ok: true, t: Date.now() })
    })

    socket.on('subscribe', async (payload, ack) => {
      await handleSocketSubscribe(socket, namespace, payload, ack)
    })

    socket.on('join-order-tracking', async (orderId, ack) => {
      await handleSocketSubscribe(socket, namespace, { orderId }, ack)
    })
    socket.on('leave-order-tracking', (orderId) => {
      socket.leave(roomOrder(orderId))
    })

    socket.on('disconnect', (reason) => {
      logger.info('[Socket] disconnected', { namespace, socketId: socket.id, reason })
      void recordSocketSession(namespace, socket.userId, socket.id, false)
    })
  })
}

/**
 * Apply validated internal fan-out (HTTP from delivery/partner) — in-memory correlation dedupe only.
 */
export async function applyFanoutEnvelope(envelope) {
  const parsed = safeParseFanoutEnvelope(envelope)
  if (!parsed.success) {
    logger.error('[Socket] fanout envelope invalid', { issues: parsed.error.flatten() })
    incCounter('socket_fanout_rejected_schema')
    try {
      await emitAdminOperationalEvent(SOCKET_EVENTS.admin.SOCKET_FAILURE, {
        reason: 'INVALID_FANOUT_ENVELOPE',
        issues: parsed.error.flatten()
      })
    } catch {
      /* ignore */
    }
    return
  }
  const env = parsed.data
  if (!ioRoot || !env?.emits?.length) return
  const correlationId = env.correlationId || randomUUID()
  const ok = await acquireFanoutLock(correlationId)
  if (!ok) {
    logger.debug('[Socket] fanout deduped', { correlationId })
    incCounter('socket_fanout_deduped_correlation')
    return
  }
  for (const e of env.emits) {
    try {
      const nsp = ioRoot.of(e.namespace)
      nsp.to(e.room).emit(e.event, e.payload)
      incCounter('socket_fanout_emit_ok')
    } catch (err) {
      logger.error('[Socket] fanout emit failed', { message: err.message, event: e.event })
      incCounter('socket_fanout_emit_fail')
      try {
        await emitAdminOperationalEvent(SOCKET_EVENTS.admin.SOCKET_FAILURE, {
          reason: 'FANOUT_EMIT_FAILED',
          namespace: e.namespace,
          event: e.event,
          message: err.message
        })
      } catch {
        /* ignore */
      }
    }
  }
}

export function initializeSocket(httpServer) {
  ioRoot = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === 'production'
          ? (process.env.FRONTEND_URL || '').split(',').filter(Boolean)
          : '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT_MS || '60000', 10),
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL_MS || '25000', 10)
  })

  const namespaces = [NS.consumer, NS.delivery, NS.partner, NS.admin]
  for (const n of namespaces) {
    attachNamespaceAuth(n)
    registerNamespaceHandlers(n)
  }

  // Auth and handlers for root namespace /
  ioRoot.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '')
      if (!token) return next(new Error('Authentication error: No token provided'))
      
      let decoded = null
      try {
        decoded = verifyToken(token)
      } catch (err) {
        decoded = verifyPartnerToken(token)
      }

      if (!decoded?.id) {
        return next(new Error('Authentication error: Invalid token claims'))
      }
      
      await assertUserActive(decoded.id)
      socket.userId = decoded.id
      socket.userRole = decoded.role || decoded.roles?.[0] || 'CONSUMER'
      socket.warehouseId = decoded.warehouseId || null
      next()
    } catch (error) {
      logger.warn('[Socket] Root auth failed', { message: error.message })
      next(new Error('Authentication error: Invalid token'))
    }
  })

  ioRoot.on('connection', (socket) => {
    logger.info('[Socket] Connected to root namespace /', {
      socketId: socket.id,
      userId: socket.userId,
      role: socket.userRole
    })

    socket.on('join:store', ({ storeId }) => {
      // Secure check: Allow admin roles or matching warehouse staff
      const isAuthorized =
        ['SUPER_ADMIN', 'OPERATIONAL_ADMIN', 'ADMIN', 'OPS_ADMIN'].includes(socket.userRole) ||
        String(socket.warehouseId) === String(storeId)

      if (isAuthorized) {
        socket.join(`store:${storeId}`)
        logger.info(`[Socket] Client joined store room store:${storeId}`)
      } else {
        logger.warn(`[Socket] Unauthorized join:store attempt by user ${socket.userId} for store ${storeId}`)
      }
    })

    socket.on('disconnect', (reason) => {
      logger.info('[Socket] Disconnected from root namespace /', { socketId: socket.id, reason })
    })
  })

  logger.info('[Socket] Socket.IO initialized (single-node in-memory adapter)', { namespaces })
  return ioRoot
}

export function getIO() {
  if (!ioRoot) {
    throw new Error('Socket.io not initialized. Call initializeSocket() first.')
  }
  return ioRoot
}

import { resolveCustomerOrderStage } from '../controllers/ordersController.js'

async function buildOrderFanoutPayload(orderId, status, extra = {}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      consumerId: true,
      warehouseId: true,
      agentId: true,
      delivery: { select: { status: true, agentId: true } }
    }
  })
  const stageInfo = resolveCustomerOrderStage(order || { status })
  const base = {
    v: REALTIME_PAYLOAD_VERSION,
    orderId,
    orderNumber: order?.orderNumber || '',
    status: status || order?.status,
    currentStatus: stageInfo.status,
    currentStage: stageInfo.stage,
    stageName: stageInfo.stageName,
    orderStatusLabel: stageInfo.label,
    timestamp: new Date().toISOString(),
    ...extra
  }
  return { order, base }
}

/**
 * Full multi-namespace + legacy room emit for order status.
 */
export async function emitOrderStatusUpdate(orderId, status, data = {}) {
  if (!ioRoot) return
  const { order, base } = await buildOrderFanoutPayload(orderId, status, data)
  if (!order) return

  const payload = { ...base, ...data }

  try {
    ioRoot
      .of(NS.consumer)
      .to(roomOrder(orderId))
      .emit(SOCKET_EVENTS.consumer.ORDER_STATUS_UPDATED, payload)
    ioRoot.of(NS.consumer).to(roomUser(order.consumerId)).emit(SOCKET_EVENTS.consumer.ORDER_STATUS_UPDATED, payload)
  } catch (e) {
    logger.error('[Socket] consumer status emit', { message: e.message })
  }

  try {
    ioRoot.of(NS.admin).to(roomAdminGlobal()).emit(SOCKET_EVENTS.admin.ORDER_UPDATED, payload)
  } catch (e) {
    logger.warn('[Socket] admin emit', { message: e.message })
  }

  if (order.warehouseId) {
    try {
      ioRoot
        .of(NS.partner)
        .to(roomWarehouse(order.warehouseId))
        .emit(SOCKET_EVENTS.partner.ORDER_UPDATED, payload)

      // Emit to root namespace store room
      ioRoot.to(`store:${order.warehouseId}`).emit('order:status', payload)
      if (status === 'PLACED') {
        ioRoot.to(`store:${order.warehouseId}`).emit('order:new', payload)
      }
    } catch (e) {
      logger.warn('[Socket] partner emit', { message: e.message })
    }
  }

  const agentId = order.agentId || order.delivery?.agentId
  if (agentId) {
    try {
      ioRoot
        .of(NS.delivery)
        .to(roomOrder(orderId))
        .emit(SOCKET_EVENTS.delivery.STATUS_UPDATED, payload)
      ioRoot
        .of(NS.delivery)
        .to(roomDeliveryAgent(agentId))
        .emit(SOCKET_EVENTS.delivery.STATUS_UPDATED, payload)
    } catch (e) {
      logger.warn('[Socket] delivery emit', { message: e.message })
    }
  }

  // Legacy event for older mobile clients
  ioRoot.of(NS.consumer).to(roomOrder(orderId)).emit('order-status-update', {
    orderId,
    status,
    timestamp: payload.timestamp,
    ...data
  })
  incCounter('socket_order_status_emit')
}

export async function emitLocationUpdate(orderId, location, eta = null, meta = {}) {
  if (!ioRoot) return
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { consumerId: true, warehouseId: true, agentId: true, delivery: { select: { agentId: true } } }
  })
  if (!order) return
  const agentId = order.agentId || order.delivery?.agentId
  const payload = {
    v: REALTIME_PAYLOAD_VERSION,
    orderId,
    location,
    eta,
    timestamp: new Date().toISOString(),
    ...meta
  }
  ioRoot
    .of(NS.consumer)
    .to(roomOrder(orderId))
    .emit(SOCKET_EVENTS.consumer.RIDER_LOCATION_UPDATED, payload)
  ioRoot.of(NS.consumer).to(roomUser(order.consumerId)).emit(SOCKET_EVENTS.consumer.RIDER_LOCATION_UPDATED, payload)
  ioRoot.of(NS.admin).to(roomAdminGlobal()).emit(SOCKET_EVENTS.admin.DELIVERY_TRACKING, payload)
  if (order.warehouseId) {
    ioRoot
      .of(NS.partner)
      .to(roomWarehouse(order.warehouseId))
      .emit(SOCKET_EVENTS.partner.ORDER_UPDATED, { ...payload, kind: 'LOCATION' })
  }
  if (agentId) {
    ioRoot.of(NS.delivery).to(roomDeliveryAgent(agentId)).emit(SOCKET_EVENTS.delivery.STATUS_UPDATED, payload)
  }
  ioRoot.of(NS.consumer).to(roomOrder(orderId)).emit('location-update', {
    orderId,
    location,
    eta,
    timestamp: payload.timestamp
  })
  incCounter('socket_location_emit')
}

export function emitUserNotification(userId, notification) {
  if (!ioRoot) return
  const payload = { v: REALTIME_PAYLOAD_VERSION, ...notification }
  ioRoot
    .of(NS.consumer)
    .to(roomUser(userId))
    .emit(SOCKET_EVENTS.consumer.NOTIFICATION, payload)
  ioRoot.of(NS.consumer).to(roomUser(userId)).emit('notification', notification)
}

export default {
  initializeSocket,
  getIO,
  isSocketInitialized,
  emitOrderStatusUpdate,
  emitLocationUpdate,
  emitUserNotification,
  emitAdminOperationalEvent,
  applyFanoutEnvelope
}
