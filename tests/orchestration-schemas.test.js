import test from 'node:test'
import assert from 'node:assert/strict'
import { FanoutEnvelopeSchema, InternalOrderStatusSyncSchema } from '../services/orchestration/schemas.js'

test('FanoutEnvelopeSchema accepts minimal valid envelope', () => {
  const r = FanoutEnvelopeSchema.safeParse({
    correlationId: 'corr-12345678',
    emits: [
      {
        namespace: '/consumer',
        room: 'order:x',
        event: 'consumer:order_status_updated',
        payload: { orderId: 'x', status: 'PLACED' }
      }
    ]
  })
  assert.equal(r.success, true)
})

test('FanoutEnvelopeSchema rejects empty emits', () => {
  const r = FanoutEnvelopeSchema.safeParse({ emits: [] })
  assert.equal(r.success, false)
})

test('InternalOrderStatusSyncSchema validates orderId', () => {
  const bad = InternalOrderStatusSyncSchema.safeParse({
    orderId: 'not-a-uuid',
    status: 'DELIVERED'
  })
  assert.equal(bad.success, false)
})
