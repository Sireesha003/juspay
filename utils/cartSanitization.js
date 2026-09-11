import { partitionCartLines } from './cartItemValidity.js'

/**
 * Validate and sanitize a fetched cart for a warehouse context.
 * Removes invalid cart lines and optionally resets coupon/tax when cart becomes empty.
 *
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {{ id: string, items: Array<any> } | null} cart
 * @param {string | null} warehouseId
 * @param {{ resetCartMetaWhenEmpty?: boolean }} [options]
 * @returns {Promise<{ removedInvalidCount: number, invalidReasons: string[] }>}
 */
export async function validateAndSanitizeCart(
  prismaClient,
  cart,
  warehouseId,
  options = {}
) {
  const resetCartMetaWhenEmpty = options.resetCartMetaWhenEmpty !== false
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return { removedInvalidCount: 0, invalidReasons: [] }
  }

  const { invalid } = partitionCartLines(cart.items, warehouseId)
  if (invalid.length === 0) {
    return { removedInvalidCount: 0, invalidReasons: [] }
  }

  const invalidIds = invalid.map(({ item }) => item.id)
  await prismaClient.cartItem.deleteMany({
    where: { id: { in: invalidIds } }
  })

  if (resetCartMetaWhenEmpty) {
    const remaining = await prismaClient.cartItem.count({
      where: { cartId: cart.id }
    })
    if (remaining === 0) {
      await prismaClient.cart.update({
        where: { id: cart.id },
        data: {
          appliedCouponId: null,
          appliedCouponCode: null,
          taxAmount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          taxableAmount: 0
        }
      })
    }
  }

  return {
    removedInvalidCount: invalid.length,
    invalidReasons: invalid.map((row) => row.reason)
  }
}
