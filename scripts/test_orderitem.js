import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testOrderItemCreate() {
  try {
    const item = await prisma.orderItem.findMany({
      take: 1,
      select: {
        id: true,
        orderId: true,
        productId: true,
        unit: true,
        unitPrice: true,
        totalPrice: true
      }
    });
    console.log('SUCCESS: OrderItem model query succeeds:', item);
  } catch (error) {
    console.error('OrderItem query error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testOrderItemCreate();
