import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testOrderVersion() {
  try {
    const orders = await prisma.order.findMany({
      take: 1,
      select: { id: true, version: true }
    });
    console.log('SUCCESS: Queried Order table with version field successfully:', orders);
  } catch (error) {
    console.error('Test query failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testOrderVersion();
