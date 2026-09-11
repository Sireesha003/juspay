import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'

import { prisma } from '../config/prismaClient.js'
import { createOrder } from '../services/orderCreationService.js'

function resetPrismaMocks() {
  prisma.cart.findFirst = async () => null
  prisma.cartItem.deleteMany = async () => ({ count: 0 })
  prisma.cartItem.count = async () => 1
  prisma.cart.update = async () => ({})

  prisma.order.findFirst = async () => null
  prisma.order.update = async () => ({})

  prisma.address.findUnique = async () => null
  prisma.address.findFirst = async () => null

  prisma.product.findUnique = async () => null
  prisma.product.update = async () => ({})
  prisma.productVariant.findFirst = async () => null
  prisma.productVariant.update = async () => ({})

  prisma.warehouse.findUnique = async () => null
  prisma.warehouseDeliverySetting.findUnique = async () => null
  prisma.masterDeliverySetting.findMany = async () => []
  prisma.deliveryChargeRule.findFirst = async () => null

  prisma.coupon.findUnique = async () => null
  prisma.couponRedemption.count = async () => 0

  prisma.$transaction = async (fn) =>
    fn({
      order: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async ({ data }) => ({
          id: 'new-order-2',
          orderNumber: data.orderNumber,
          totalAmount: data.totalAmount
        }),
        update: async () => ({})
      },
      orderItem: {
        create: async () => ({})
      },
      payment: {
        create: async () => ({})
      },
      delivery: {
        create: async () => ({})
      },
      product: {
        update: async () => ({})
      },
      productVariant: {
        update: async () => ({})
      },
      coupon: {
        update: async () => ({})
      },
      couponRedemption: {
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
        create: async () => ({})
      }
    })
}

beforeEach(() => {
  resetPrismaMocks()
})

describe('Order creation allows multiple active orders', () => {
  it('placing second order does not mutate first order status', async () => {
    const cancelledOrderUpdates = []

    prisma.cart.findFirst = async () => ({
      id: 'cart-1',
      userId: 'user-1',
      warehouseId: 'wh-1',
      appliedCouponCode: null,
      expiresAt: null,
      items: [
        {
          id: 'ci-1',
          quantity: 2,
          productId: 'p-1',
          productVariantId: null,
          product: {
            id: 'p-1',
            name: 'Rice',
            price: 100,
            stock: 20,
            isActive: true,
            warehouseId: 'wh-1',
            taxRate: 0,
            mrp: 110,
            images: [],
            unit: 'PIECE'
          },
          productVariant: null
        }
      ]
    })

    prisma.order.findFirst = async () => ({
      id: 'existing-order-1',
      addressId: 'addr-1',
      deliveryType: 'FAST',
      couponCode: null,
      items: [
        {
          productId: 'p-1',
          productVariantId: null,
          quantity: 1,
          isCancelled: false
        }
      ]
    })

    prisma.order.update = async ({ data }) => {
      if (data?.status === 'CANCELLED') {
        cancelledOrderUpdates.push(data)
      }
      return {}
    }

    prisma.address.findUnique = async () => ({
      id: 'addr-1',
      userId: 'user-1',
      state: 'Telangana',
      pincode: '500001',
      location: { lat: 17.385, lng: 78.4867 }
    })

    prisma.product.findUnique = async ({ where }) => {
      if (where.id === 'p-1') {
        return { id: 'p-1', warehouseId: 'wh-1', name: 'Rice', stock: 20, isActive: true }
      }
      return null
    }

    prisma.warehouse.findUnique = async () => ({
      id: 'wh-1',
      state: 'TS',
      isActive: true,
      servicePincodes: ['500001'],
      location: { lat: 17.4, lng: 78.4 }
    })

    const result = await createOrder('user-1', {
      warehouseId: 'wh-1',
      deliveryType: 'FAST',
      addressId: 'addr-1'
    })

    assert.strictEqual(result.reusedExistingOrder, false)
    assert.strictEqual(result.orderId, 'new-order-2')
    assert.strictEqual(cancelledOrderUpdates.length, 0)
  })
})
