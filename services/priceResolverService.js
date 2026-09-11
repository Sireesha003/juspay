import { prisma } from '../config/prismaClient.js';


export class PriceResolverService {
  /**
   * Resolves the active price for a product on a specific channel and date.
   * @param {Object} params
   * @param {string} params.productId
   * @param {string} params.channel - "POS", "ONLINE", "QUICK", "VEHICLE"
   * @param {Date} [params.date] - Optional date to check (defaults to now)
   * @param {number} [params.quantity] - Quantity to check for volume/tier pricing
   */
  static async resolvePrice({ productId, productVariantId = null, channel, date = new Date(), quantity = 1 }) {
    if (!productId || !channel) {
      throw new Error('productId and channel are required for price resolution.');
    }

    // 1. Fetch matching Price Book by code
    let channelKey = channel;
    if (channel.includes('_')) {
      const parts = channel.split('_');
      channelKey = `${parts[0].toUpperCase()}_${parts.slice(1).join('_').toLowerCase()}`;
    } else {
      channelKey = channel.toUpperCase();
    }

    let priceBook = await prisma.priceBook.findFirst({
      where: {
        code: channelKey,
        isActive: true
      }
    });

    if (!priceBook && channelKey.includes('_')) {
      const baseChannel = channelKey.split('_')[0];
      priceBook = await prisma.priceBook.findFirst({
        where: {
          code: baseChannel,
          isActive: true
        }
      });
    }

    if (!priceBook) {
      return this.getDefaultProductPrice(productId, productVariantId, quantity);
    }

    // 2. Fetch active variant-level ProductPrice matching date range if variantId is provided
    let resolvedPrice = null;
    if (productVariantId) {
      resolvedPrice = await prisma.productPrice.findFirst({
        where: {
          productId,
          productVariantId,
          priceBookId: priceBook.id,
          effectiveFrom: { lte: date },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: date } }
          ]
        },
        orderBy: {
          effectiveFrom: 'desc'
        }
      });
    }

    // 3. Fallback to product-level ProductPrice
    let isVariantSpecific = !!resolvedPrice;
    if (!resolvedPrice) {
      resolvedPrice = await prisma.productPrice.findFirst({
        where: {
          productId,
          productVariantId: null,
          priceBookId: priceBook.id,
          effectiveFrom: { lte: date },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: date } }
          ]
        },
        orderBy: {
          effectiveFrom: 'desc'
        }
      });
    }

    if (!resolvedPrice) {
      return this.getDefaultProductPrice(productId, productVariantId, quantity);
    }

    // If it's a product-level price and we requested a variant, we scale it proportionally
    if (!isVariantSpecific && productVariantId) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { price: true, finalPrice: true }
      });
      const variant = await prisma.productVariant.findUnique({
        where: { id: productVariantId },
        select: { sellingPrice: true, mrp: true }
      });

      if (product && variant) {
        const basePrice = (product.finalPrice != null ? Number(product.finalPrice) : Number(product.price)) || 1;
        const ratio = resolvedPrice.sellingPrice / basePrice;
        const variantSelling =
          variant.sellingPrice != null
            ? Number(variant.sellingPrice)
            : Number(variant.mrp) || 0;
        return {
          mrp: variant.mrp != null ? Math.round(variant.mrp * ratio * 100) / 100 : resolvedPrice.mrp,
          sellingPrice: Math.round(variantSelling * ratio * 100) / 100,
          priceBookId: resolvedPrice.priceBookId,
          priceBookName: priceBook.name,
          source: 'price_book_scaled'
        };
      }
    }

    let finalPrice = {
      mrp: resolvedPrice.mrp,
      sellingPrice: resolvedPrice.sellingPrice,
      priceBookId: resolvedPrice.priceBookId,
      priceBookName: priceBook.name,
      source: isVariantSpecific ? 'price_book_variant' : 'price_book'
    };

    // 4. Check for ProductTierPrice overrides based on quantity
    const tierPrice = await prisma.productTierPrice.findFirst({
      where: {
        productId,
        ...(productVariantId ? { productVariantId } : { productVariantId: null }),
        isActive: true,
        minQuantity: { lte: quantity },
        OR: [
          { maxQuantity: null },
          { maxQuantity: { gte: quantity } }
        ]
      },
      orderBy: {
        minQuantity: 'desc'
      }
    });

    if (tierPrice) {
      finalPrice.sellingPrice = tierPrice.price;
      finalPrice.source = 'tiered_pricing';
    }

    return finalPrice;
  }

  /**
   * Fallback method to get standard prices defined on the product/variant itself.
   */
  static async getDefaultProductPrice(productId, productVariantId = null, quantity = 1) {
    if (productVariantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: productVariantId },
        select: { sellingPrice: true, mrp: true }
      });
      if (variant) {
        const vSelling =
          variant.sellingPrice != null
            ? Number(variant.sellingPrice)
            : Number(variant.mrp) || 0;

        let finalPrice = {
          mrp: variant.mrp || vSelling || 0,
          sellingPrice: vSelling,
          source: 'variant_fallback'
        };

        const tierPrice = await prisma.productTierPrice.findFirst({
          where: {
            productId,
            productVariantId,
            isActive: true,
            minQuantity: { lte: quantity || 1 },
            OR: [
              { maxQuantity: null },
              { maxQuantity: { gte: quantity || 1 } }
            ]
          },
          orderBy: {
            minQuantity: 'desc'
          }
        });

        if (tierPrice) {
          finalPrice.sellingPrice = tierPrice.price;
          finalPrice.source = 'tiered_pricing';
        }

        return finalPrice;
      }
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { price: true, finalPrice: true, mrp: true }
    });

    if (!product) {
      return {
        mrp: 0,
        sellingPrice: 0,
        source: 'not_found'
      };
    }

    const pSelling =
      product.finalPrice != null
        ? Number(product.finalPrice)
        : Number(product.price) || 0;

    let finalPrice = {
      mrp: product.mrp || pSelling || 0,
      sellingPrice: pSelling,
      source: 'product_fallback'
    };

    // Check tier prices even on fallback
    const tierPrice = await prisma.productTierPrice.findFirst({
      where: {
        productId,
        productVariantId: null,
        isActive: true,
        minQuantity: { lte: quantity || 1 },
        OR: [
          { maxQuantity: null },
          { maxQuantity: { gte: quantity || 1 } }
        ]
      },
      orderBy: {
        minQuantity: 'desc'
      }
    });

    if (tierPrice) {
      finalPrice.sellingPrice = tierPrice.price;
      finalPrice.source = 'tiered_pricing';
    }

    return finalPrice;
  }
}
