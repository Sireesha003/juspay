import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkOrderItemColumns() {
  try {
    const cols = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'OrderItem';
    `);
    console.log('OrderItem table columns in database:', cols);
  } catch (err) {
    console.error('Error querying columns:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkOrderItemColumns();
