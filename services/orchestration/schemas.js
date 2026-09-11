import { z } from 'zod'

/** Cross-service / internal fan-out envelope (consumer Socket.IO hub). */
export const FanoutEmitSchema = z.object({
  namespace: z.string().min(1).max(64),
  room: z.string().min(1).max(256),
  event: z.string().min(1).max(128),
  payload: z.any().optional()
})

export const FanoutEnvelopeSchema = z.object({
  correlationId: z.string().min(8).max(128).optional(),
  emits: z.array(FanoutEmitSchema).min(1).max(64)
})

export const InternalOrderStatusSyncSchema = z.object({
  eventId: z.string().max(128).optional().nullable(),
  orderId: z.string().uuid(),
  status: z.string().min(1).max(64),
  agentId: z.string().uuid().optional().nullable(),
  deliveredAt: z.union([z.string().datetime(), z.string(), z.null()]).optional(),
  deliveryStatus: z.string().max(64).optional().nullable()
})

export const InternalRealtimeLocationEmitSchema = z.object({
  orderId: z.string().uuid(),
  location: z.object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    accuracy: z.coerce.number().optional().nullable(),
    timestamp: z.string().optional().nullable()
  }),
  eta: z.any().optional().nullable()
})

export const InternalOrderLocationSyncSchema = z.object({
  orderId: z.string().uuid(),
  location: z.object({
    lat: z.coerce.number(),
    lng: z.coerce.number()
  })
})

/** BullMQ / enqueue payload (consumer notification worker). */
export const OrderNotificationJobSchema = z.object({
  orderId: z.string().uuid(),
  status: z.string().min(1).max(64),
  previousStatus: z.string().max(64).optional().nullable(),
  eventId: z.string().max(128).optional().nullable(),
  source: z.string().max(64).optional()
})

export function parseFanoutEnvelope(raw) {
  return FanoutEnvelopeSchema.parse(raw)
}

export function safeParseFanoutEnvelope(raw) {
  return FanoutEnvelopeSchema.safeParse(raw)
}
