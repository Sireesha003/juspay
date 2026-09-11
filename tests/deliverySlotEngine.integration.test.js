/**
 * Integration tests for the delivery slot engine.
 * Covers: slot booking, capacity, concurrent booking, slot release on cancel,
 * route-based slot filtering, blackout dates, pickup slot capacity.
 *
 * Run: node --test tests/deliverySlotEngine.integration.test.js
 * From repo: cd villagkart-cusumer-api && npm test
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'

// -----------------------------------------------------------------------------
// 1. Slot booking (bookDeliverySlotWithTx) – atomic, capacity-protected
// -----------------------------------------------------------------------------
describe('Delivery slot engine – slot booking', () => {
  it('bookDeliverySlotWithTx creates legacy slot when none exists and increments booked', async () => {
    const deliveryDate = new Date(Date.UTC(2025, 5, 15))
    const createdSlot = {
      id: 'slot-id-1',
      warehouseId: 'wh-1',
      date: deliveryDate,
      slot: '09:00-12:00',
      routeMapId: null,
      capacity: 10,
      booked: 1,
      isActive: true,
    }
    const updateResult = { ...createdSlot, booked: 1 }

    const findFirstCalls = []
    const createCalls = []
    const rawCalls = []

    const tx = {
      deliverySlot: {
        findFirst: async (arg) => {
          findFirstCalls.push(arg)
          return null
        },
        create: async (arg) => {
          createCalls.push(arg)
          return createdSlot
        },
      },
      $queryRaw: async (strings, ...values) => {
        rawCalls.push({ strings: strings.join(''), values })
        return [updateResult]
      },
    }

    const { bookDeliverySlotWithTx } = await import('../utils/deliverySlotUtils.js')
    const result = await bookDeliverySlotWithTx(tx, 'wh-1', deliveryDate, '09:00-12:00', null)

    assert.strictEqual(result.booked, 1)
    assert.ok(findFirstCalls.length >= 1, 'findFirst called (and possibly again for anySlotForKey)')
    assert.strictEqual(createCalls.length, 1)
    assert.strictEqual(createCalls[0].data.warehouseId, 'wh-1')
    assert.strictEqual(createCalls[0].data.slot, '09:00-12:00')
    assert.strictEqual(createCalls[0].data.routeMapId, null)
    assert.strictEqual(createCalls[0].data.capacity, 10)
    assert.strictEqual(rawCalls.length, 1)
    assert.ok(
      rawCalls[0].strings.includes('UPDATE') && rawCalls[0].strings.includes('booked') && rawCalls[0].strings.includes('capacity'),
      'UPDATE must use booked and capacity for atomic increment'
    )
  })

  it('bookDeliverySlotWithTx uses existing slot and atomic UPDATE (booked < capacity)', async () => {
    const deliveryDate = new Date(Date.UTC(2025, 5, 15))
    const existingSlot = {
      id: 'slot-id-2',
      warehouseId: 'wh-1',
      date: deliveryDate,
      slot: '09:00-12:00',
      routeMapId: null,
      capacity: 10,
      booked: 2,
      isActive: true,
    }
    const updatedSlot = { ...existingSlot, booked: 3 }

    const tx = {
      deliverySlot: {
        findFirst: async () => existingSlot,
        create: async () => assert.fail('create should not be called'),
      },
      $queryRaw: async () => [updatedSlot],
    }

    const { bookDeliverySlotWithTx } = await import('../utils/deliverySlotUtils.js')
    const result = await bookDeliverySlotWithTx(tx, 'wh-1', deliveryDate, '09:00-12:00', null)
    assert.strictEqual(result.booked, 3)
  })
})

// -----------------------------------------------------------------------------
// 2. Slot capacity – booking fails when at capacity
// -----------------------------------------------------------------------------
describe('Delivery slot engine – slot capacity', () => {
  it('bookDeliverySlotWithTx throws when UPDATE returns no row (slot full)', async () => {
    const deliveryDate = new Date(Date.UTC(2025, 5, 15))
    const existingSlot = {
      id: 'slot-id-full',
      warehouseId: 'wh-1',
      date: deliveryDate,
      slot: '09:00-12:00',
      routeMapId: null,
      capacity: 2,
      booked: 2,
      isActive: true,
    }

    const tx = {
      deliverySlot: {
        findFirst: async () => existingSlot,
        create: async () => assert.fail('create should not be called'),
      },
      $queryRaw: async () => [], // booked < capacity false, no row returned
    }

    const { bookDeliverySlotWithTx } = await import('../utils/deliverySlotUtils.js')
    await assert.rejects(
      () => bookDeliverySlotWithTx(tx, 'wh-1', deliveryDate, '09:00-12:00', null),
      /full|not available/i
    )
  })
})

// -----------------------------------------------------------------------------
// 3. Concurrent booking – atomic UPDATE ensures only capacity-many succeed
// -----------------------------------------------------------------------------
describe('Delivery slot engine – concurrent booking', () => {
  it('atomic UPDATE condition (booked < capacity) prevents overbook when simulated', async () => {
    const deliveryDate = new Date(Date.UTC(2025, 5, 15))
    const existingSlot = {
      id: 'slot-concurrent',
      warehouseId: 'wh-1',
      date: deliveryDate,
      slot: '09:00-12:00',
      routeMapId: null,
      capacity: 2,
      booked: 0,
      isActive: true,
    }

    let bookedValue = 0
    const tx = {
      deliverySlot: {
        findFirst: async () => ({ ...existingSlot, booked: bookedValue }),
        create: async () => assert.fail('create should not be called'),
      },
      $queryRaw: async () => {
        if (bookedValue >= 2) return []
        bookedValue += 1
        return [{ ...existingSlot, booked: bookedValue }]
      },
    }

    const { bookDeliverySlotWithTx } = await import('../utils/deliverySlotUtils.js')
    const r1 = await bookDeliverySlotWithTx(tx, 'wh-1', deliveryDate, '09:00-12:00', null)
    const r2 = await bookDeliverySlotWithTx(tx, 'wh-1', deliveryDate, '09:00-12:00', null)
    assert.strictEqual(r1.booked, 1)
    assert.strictEqual(r2.booked, 2)
    await assert.rejects(
      () => bookDeliverySlotWithTx(tx, 'wh-1', deliveryDate, '09:00-12:00', null),
      /full|not available/i
    )
  })
})

// -----------------------------------------------------------------------------
// 4. Slot release on cancellation – by id first, then fallback
// -----------------------------------------------------------------------------
describe('Delivery slot engine – slot release on cancellation', () => {
  it('releaseDeliverySlotByIdWithTx decrements booked atomically (booked > 0)', async () => {
    const rawCalls = []
    const tx = {
      $queryRaw: async (strings, ...values) => {
        rawCalls.push({ strings: strings.join(''), values })
        return [{ id: 'slot-1', booked: 4 }]
      },
    }

    const { releaseDeliverySlotByIdWithTx } = await import('../utils/deliverySlotUtils.js')
    await releaseDeliverySlotByIdWithTx(tx, 'slot-1')
    assert.strictEqual(rawCalls.length, 1)
    assert.ok(
      rawCalls[0].strings.includes('booked') && rawCalls[0].strings.includes('- 1'),
      'Release must use booked = booked - 1'
    )
    assert.ok(rawCalls[0].strings.includes('booked') && rawCalls[0].strings.includes('> 0'), 'Must guard booked > 0')
  })

  it('releaseDeliverySlotByIdWithTx is no-op when deliverySlotId is null', async () => {
    const tx = { $queryRaw: async () => assert.fail('should not be called') }
    const { releaseDeliverySlotByIdWithTx } = await import('../utils/deliverySlotUtils.js')
    await releaseDeliverySlotByIdWithTx(tx, null)
    await releaseDeliverySlotByIdWithTx(tx, undefined)
  })

  it('releaseDeliverySlotWithTx finds row by routeMapId and decrements atomically', async () => {
    const deliveryDate = new Date(Date.UTC(2025, 5, 15))
    const row = { id: 'slot-route-1', booked: 3, routeMapId: 'route-1' }
    const findFirstCalls = []
    const findManyCalls = []
    const rawCalls = []

    const tx = {
      deliverySlot: {
        findFirst: async (arg) => {
          findFirstCalls.push(arg)
          return row
        },
        findMany: async (arg) => {
          findManyCalls.push(arg)
          return []
        },
      },
      $queryRaw: async (strings, ...values) => {
        rawCalls.push({ strings: strings.join('') })
        return [{ id: row.id, booked: 2 }]
      },
    }

    const { releaseDeliverySlotWithTx } = await import('../utils/deliverySlotUtils.js')
    await releaseDeliverySlotWithTx(tx, 'wh-1', deliveryDate, '09:00-12:00', 'route-1')

    assert.strictEqual(findFirstCalls.length, 1)
    assert.strictEqual(findFirstCalls[0].where.routeMapId, 'route-1')
    assert.strictEqual(rawCalls.length, 1)
    assert.ok(rawCalls[0].strings.includes('booked') && rawCalls[0].strings.includes('- 1'))
  })
})

// -----------------------------------------------------------------------------
// 5. Route-based slot filtering – getAvailableSlots with routeMapIds
// -----------------------------------------------------------------------------
describe('Delivery slot engine – route-based slot filtering', () => {
  it('normalizeLegacySlotKey maps MORNING-06:00 to MORNING', async () => {
    const { normalizeLegacySlotKey } = await import('../utils/deliverySlotUtils.js')
    assert.strictEqual(normalizeLegacySlotKey('MORNING-06:00'), 'MORNING')
    assert.strictEqual(normalizeLegacySlotKey('AFTERNOON-12:00'), 'AFTERNOON')
    assert.strictEqual(normalizeLegacySlotKey('09:00-12:00'), '09:00-12:00')
  })

  it('resolveRouteMapIdsForPincode returns empty array when pincode is empty', async () => {
    const { resolveRouteMapIdsForPincode } = await import('../utils/deliverySlotUtils.js')
    const ids = await resolveRouteMapIdsForPincode('wh-1', '')
    assert.ok(Array.isArray(ids))
    assert.strictEqual(ids.length, 0)
  })

  it('resolveRouteMapIdsForPincode returns empty array when warehouseId is empty', async () => {
    const { resolveRouteMapIdsForPincode } = await import('../utils/deliverySlotUtils.js')
    const ids = await resolveRouteMapIdsForPincode('', '500001')
    assert.ok(Array.isArray(ids))
    assert.strictEqual(ids.length, 0)
  })
})

// -----------------------------------------------------------------------------
// 6. Blackout dates – getBlackoutDatesForWarehouse returns Set of YYYY-MM-DD
// -----------------------------------------------------------------------------
describe('Delivery slot engine – blackout dates', () => {
  it('getBlackoutDatesForWarehouse returns empty Set when warehouseId is missing', async () => {
    const { getBlackoutDatesForWarehouse } = await import('../services/deliveryConfigurationService.js')
    const set = await getBlackoutDatesForWarehouse('', new Date(), new Date())
    assert.ok(set instanceof Set)
    assert.strictEqual(set.size, 0)
  })

  it('getBlackoutDatesForWarehouse returns Set (type check)', async () => {
    const { getBlackoutDatesForWarehouse } = await import('../services/deliveryConfigurationService.js')
    const from = new Date(Date.UTC(2025, 5, 1))
    const to = new Date(Date.UTC(2025, 5, 30))
    const set = await getBlackoutDatesForWarehouse('wh-nonexistent', from, to)
    assert.ok(set instanceof Set)
  })
})

// -----------------------------------------------------------------------------
// 7. Pickup slot capacity – reserve and release
// -----------------------------------------------------------------------------
describe('Delivery slot engine – pickup slot capacity', () => {
  it('reservePickupSlot increments booked when booked < capacity', async () => {
    const tx = {
      $queryRaw: async () => [{ id: 'pickup-1', booked: 3, capacity: 10 }],
    }
    const { reservePickupSlot } = await import('../services/pickupSlotService.js')
    const result = await reservePickupSlot(tx, 'pickup-1')
    assert.strictEqual(result.id, 'pickup-1')
    assert.strictEqual(result.booked, 3)
    assert.strictEqual(result.capacity, 10)
  })

  it('reservePickupSlot throws when slot is full (no row returned)', async () => {
    const tx = { $queryRaw: async () => [] }
    const { reservePickupSlot } = await import('../services/pickupSlotService.js')
    await assert.rejects(
      () => reservePickupSlot(tx, 'pickup-full'),
      /full|not available/i
    )
  })

  it('releasePickupSlot decrements booked atomically (booked > 0)', async () => {
    const rawCalls = []
    const tx = {
      $queryRaw: async (strings, ...values) => {
        rawCalls.push({ strings: strings.join('') })
        return [{ id: 'pickup-1', booked: 2 }]
      },
    }
    const { releasePickupSlot } = await import('../services/pickupSlotService.js')
    await releasePickupSlot(tx, { pickupSlotId: 'pickup-1' })
    assert.strictEqual(rawCalls.length, 1)
    assert.ok(rawCalls[0].strings.includes('booked') && rawCalls[0].strings.includes('- 1'))
    assert.ok(rawCalls[0].strings.includes('> 0'))
  })

  it('releasePickupSlot is no-op when order has no pickupSlotId', async () => {
    const tx = { $queryRaw: async () => assert.fail('should not be called') }
    const { releasePickupSlot } = await import('../services/pickupSlotService.js')
    await releasePickupSlot(tx, {})
    await releasePickupSlot(tx, { pickupSlotId: null })
  })
})
