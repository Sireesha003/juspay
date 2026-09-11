import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'

import { prisma } from '../config/prismaClient.js'
import {
  addCartItem,
  getCart,
  removeCartItem,
  updateCartItem,
  validateCart
} from '../controllers/cartController.js'

function createMockRes(done) {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      done({ statusCode: this.statusCode, payload })
      return this
    }
  }
}

function callHandler(handler, req) {
  return new Promise((resolve, reject) => {
    const res = createMockRes(resolve)
    handler(req, res, reject)
  })
}

function buildCartItem({
  id,
  productId,
  warehouseId,
  quantity = 1,
  price = 100
}) {
  return {
    id,
    productId,
    productVariantId: null,
    quantity,
    snapshotPrice: price,
    priceUpdatedAt: new Date(),
    addedAt: new Date(),
    product: {
      id: productId,
      name: `Product ${productId}`,
      price,
      mrp: price + 20,
      taxRate: 5,
      images: [],
      unit: 'kg',
      stock: 100,
      sku: `SKU-${productId}`,
      isActive: true,
      warehouseId,
      brand: null,
      category: null
    },
    productVariant: null
  }
}

function resetPrismaMocks() {
  prisma.cart.findFirst = async () => null
  prisma.cart.findMany = async () => []
  prisma.cart.create = async () => {
    throw new Error('Unexpected prisma.cart.create call')
  }
  prisma.cart.update = async () => ({})
  prisma.cartItem.findUnique = async () => null
  prisma.cartItem.findFirst = async () => null
  prisma.cartItem.update = async () => ({})
  prisma.cartItem.create = async () => ({})
  prisma.cartItem.delete = async () => ({})
  prisma.cartItem.deleteMany = async () => ({ count: 0 })
  prisma.cartItem.count = async () => 0
  prisma.coupon.findUnique = async () => null
  prisma.warehouse.findUnique = async () => null
  prisma.product.findUnique = async () => null
  prisma.productVariant.findFirst = async () => null
}

beforeEach(() => {
  resetPrismaMocks()
})

describe('Cart warehouse scoping', () => {
  it('addCartItem allows different warehouse by isolating warehouse cart', async () => {
    const userId = 'user-1'
    let createdCartItemPayload = null

    prisma.product.findUnique = async ({ where }) => {
      if (where.id === 'p-2') {
        return {
          id: 'p-2',
          name: 'New Product',
          price: 120,
          stock: 50,
          isActive: true,
          warehouseId: 'wh-2'
        }
      }
      return null
    }

    prisma.cart.findFirst = async ({ where }) => {
      if (where.userId === userId && where.warehouseId === 'wh-2') {
        return {
          id: 'cart-wh2',
          userId,
          warehouseId: 'wh-2',
          appliedCouponId: null,
          appliedCouponCode: null,
          updatedAt: new Date(),
          items: []
        }
      }
      return null
    }
    prisma.cartItem.create = async ({ data }) => {
      createdCartItemPayload = data
      return { id: 'ci-new', ...data }
    }
    prisma.warehouse.findUnique = async ({ where }) => ({
      id: where.id,
      state: 'TS',
      address: 'Warehouse Address'
    })

    const req = {
      user: { id: userId },
      body: { productId: 'p-2', quantity: 1, type: 'inc' },
      query: {},
      headers: {},
      normalizedWarehouseId: 'wh-2'
    }

    const result = await callHandler(addCartItem, req)
    assert.strictEqual(result.statusCode, 200)
    assert.strictEqual(result.payload.status, true)
    assert.ok(createdCartItemPayload)
    assert.strictEqual(createdCartItemPayload.cartId, 'cart-wh2')
  })

  it('getCart returns warehouse-specific cart only', async () => {
    const userId = 'user-2'
    const wh2Item = buildCartItem({
      id: 'ci-22',
      productId: 'p-22',
      warehouseId: 'wh-2',
      quantity: 3,
      price: 200
    })

    prisma.cart.findFirst = async ({ where }) => {
      if (where.userId === userId && where.warehouseId === 'wh-2') {
        return {
          id: 'cart-2',
          userId,
          warehouseId: 'wh-2',
          appliedCouponId: null,
          appliedCouponCode: null,
          updatedAt: new Date(),
          items: [wh2Item]
        }
      }
      return null
    }
    prisma.warehouse.findUnique = async ({ where }) => ({
      id: where.id,
      state: 'TS',
      address: 'Warehouse Address'
    })

    const req = {
      user: { id: userId },
      query: { warehouseId: 'wh-2' },
      body: {},
      headers: {},
      normalizedWarehouseId: 'wh-2'
    }

    const result = await callHandler(getCart, req)
    assert.strictEqual(result.statusCode, 200)
    assert.strictEqual(result.payload.status, true)
    assert.strictEqual(result.payload.data.summary.warehouseId, 'wh-2')
    assert.strictEqual(result.payload.data.items.length, 1)
    assert.strictEqual(result.payload.data.items[0].productId, 'p-22')
    assert.strictEqual(result.payload.data.summary.subtotal, 600)
  })

  it('updateCartItem responds from matching warehouse cart', async () => {
    const userId = 'user-3'
    const wh1Item = buildCartItem({
      id: 'ci-31',
      productId: 'p-31',
      warehouseId: 'wh-1',
      quantity: 4,
      price: 100
    })

    prisma.cartItem.findUnique = async ({ where }) => {
      if (where.id === 'ci-31') {
        return {
          id: 'ci-31',
          cart: { userId },
          product: wh1Item.product,
          productVariant: null
        }
      }
      return null
    }

    prisma.cartItem.update = async () => ({
      id: 'ci-31',
      productId: 'p-31',
      quantity: 5,
      addedAt: new Date(),
      product: wh1Item.product
    })

    prisma.cart.findFirst = async ({ where }) => {
      if (where.userId === userId && where.warehouseId === 'wh-1') {
        return {
          id: 'cart-3',
          userId,
          warehouseId: 'wh-1',
          appliedCouponId: null,
          appliedCouponCode: null,
          updatedAt: new Date(),
          items: [wh1Item]
        }
      }
      return null
    }

    prisma.warehouse.findUnique = async ({ where }) => ({
      id: where.id,
      state: 'TS',
      address: 'W'
    })

    const req = {
      user: { id: userId },
      params: { itemId: 'ci-31' },
      body: { quantity: 5 },
      query: {},
      headers: {},
      normalizedWarehouseId: 'wh-1'
    }

    const result = await callHandler(updateCartItem, req)
    assert.strictEqual(result.statusCode, 200)
    assert.strictEqual(result.payload.data.cart.summary.warehouseId, 'wh-1')
    assert.strictEqual(result.payload.data.cart.items.length, 1)
    assert.strictEqual(result.payload.data.cart.items[0].productId, 'p-31')
  })

  it('removeCartItem keeps response in removed item warehouse cart', async () => {
    const userId = 'user-4'
    prisma.cartItem.findUnique = async ({ where }) => {
      if (where.id === 'ci-41') {
        return {
          id: 'ci-41',
          productId: 'p-41',
          cart: { userId }
        }
      }
      return null
    }

    prisma.product.findUnique = async ({ where }) => {
      if (where.id === 'p-41') return { warehouseId: 'wh-1' }
      return null
    }

    prisma.cart.findFirst = async ({ where }) => {
      if (where.userId === userId && where.warehouseId === 'wh-1') {
        return {
          id: 'cart-4',
          userId,
          warehouseId: 'wh-1',
          appliedCouponId: null,
          appliedCouponCode: null,
          updatedAt: new Date(),
          items: []
        }
      }
      return null
    }

    const req = {
      user: { id: userId },
      params: { itemId: 'ci-41' },
      body: {},
      query: {},
      headers: {},
      normalizedWarehouseId: 'wh-1'
    }

    const result = await callHandler(removeCartItem, req)
    assert.strictEqual(result.statusCode, 200)
    assert.strictEqual(result.payload.data.cart.items.length, 0)
    assert.strictEqual(result.payload.data.cart.summary.warehouseId, null)
  })

  it('validateCart validates requested warehouse cart only', async () => {
    const userId = 'user-5'
    const wh2Item = buildCartItem({
      id: 'ci-52',
      productId: 'p-52',
      warehouseId: 'wh-2',
      quantity: 1,
      price: 100
    })

    const productLookups = []

    prisma.cart.findFirst = async ({ where }) => {
      if (where.userId === userId && where.warehouseId === 'wh-2') {
        return {
          id: 'cart-5',
          userId,
          warehouseId: 'wh-2',
          appliedCouponId: null,
          appliedCouponCode: null,
          updatedAt: new Date(),
          items: [wh2Item]
        }
      }
      return null
    }

    prisma.product.findUnique = async ({ where }) => {
      productLookups.push(where.id)
      if (where.id === 'p-52') {
        return {
          id: 'p-52',
          name: 'Scoped Product',
          price: 100,
          stock: 10,
          isActive: true,
          warehouseId: 'wh-2'
        }
      }
      return null
    }

    const req = {
      user: { id: userId },
      query: { warehouseId: 'wh-2' },
      body: {},
      headers: {},
      normalizedWarehouseId: 'wh-2'
    }

    const result = await callHandler(validateCart, req)
    assert.strictEqual(result.statusCode, 200)
    assert.strictEqual(result.payload.status, true)
    assert.strictEqual(result.payload.data.valid, true)
    assert.ok(productLookups.includes('p-52'))
    assert.strictEqual(productLookups.includes('p-51'), false)
  })
})

