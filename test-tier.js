import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function setupAndTest() {
  try {
    console.log('1. Checking if ProductTierPrice table exists...')
    try {
      await prisma.$queryRawUnsafe(`SELECT 1 FROM "ProductTierPrice" LIMIT 1`);
      console.log('Table exists!');
    } catch (e) {
      console.log('Table does not exist. Creating it manually...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "ProductTierPrice" (
            "id" TEXT NOT NULL,
            "productId" TEXT NOT NULL,
            "productVariantId" TEXT,
            "minQuantity" INTEGER NOT NULL,
            "maxQuantity" INTEGER,
            "price" DOUBLE PRECISION NOT NULL,
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,

            CONSTRAINT "ProductTierPrice_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`CREATE INDEX "ProductTierPrice_productId_idx" ON "ProductTierPrice"("productId");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX "ProductTierPrice_productVariantId_idx" ON "ProductTierPrice"("productVariantId");`);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "ProductTierPrice" ADD CONSTRAINT "ProductTierPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "ProductTierPrice" ADD CONSTRAINT "ProductTierPrice_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
      console.log('Table created successfully!');
    }

    console.log('\n2. Setting up a test product...')
    // Get any active product
    const product = await prisma.product.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, price: true }
    });

    if (!product) {
      console.log('No active product found to test with.');
      return;
    }
    
    console.log(`Using product: ${product.name} (Base Price: ${product.price})`);

    // Clean up old tiers for this product
    await prisma.productTierPrice.deleteMany({
      where: { productId: product.id }
    });

    // Create tier: 5-9 units = 10% off
    const discountedPrice1 = product.price * 0.9;
    // Create tier: 10+ units = 20% off
    const discountedPrice2 = product.price * 0.8;

    await prisma.productTierPrice.createMany({
      data: [
        {
          productId: product.id,
          minQuantity: 5,
          maxQuantity: 9,
          price: discountedPrice1,
          isActive: true
        },
        {
          productId: product.id,
          minQuantity: 10,
          maxQuantity: null,
          price: discountedPrice2,
          isActive: true
        }
      ]
    });

    console.log(`Created Tier 1: 5-9 units at ${discountedPrice1}`);
    console.log(`Created Tier 2: 10+ units at ${discountedPrice2}`);

    console.log('\n3. Testing PriceResolverService...');
    // We import dynamically to ensure it uses the updated file
    const { PriceResolverService } = await import('./services/priceResolverService.js');

    // Test Quantity = 1
    const res1 = await PriceResolverService.resolvePrice({
      productId: product.id,
      channel: 'ONLINE',
      quantity: 1
    });
    console.log(`[Qty: 1] -> Price: ${res1.sellingPrice} (Source: ${res1.source})`);

    // Test Quantity = 5
    const res5 = await PriceResolverService.resolvePrice({
      productId: product.id,
      channel: 'ONLINE',
      quantity: 5
    });
    console.log(`[Qty: 5] -> Price: ${res5.sellingPrice} (Source: ${res5.source})`);

    // Test Quantity = 15
    const res15 = await PriceResolverService.resolvePrice({
      productId: product.id,
      channel: 'ONLINE',
      quantity: 15
    });
    console.log(`[Qty: 15] -> Price: ${res15.sellingPrice} (Source: ${res15.source})`);

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect()
  }
}

setupAndTest()
