import { prisma } from '../config/prismaClient.js'

/** Get wishlist product IDs for logged-in user */
export const getWishlistProductIds = async (userId) => {
  if (!userId) return []

  const wishlist = await prisma.wishlist.findUnique({
    where: { userId },
    select: { items: true }
  })

  if (!wishlist?.items?.length) return []

  return wishlist.items
    .filter((item) => item.status === 'ACTIVE')
    .map((item) => item.productId)
}

/** Attach wishlist flag to product list */
export const attachWishlistFlag = (products, wishlistIds, userId) => {
  return products.map((product) => ({
    ...product,
    isWishlistAdded: userId ? wishlistIds.includes(product.id) : false
  }))
}
