import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userId = 'a372178e-04a5-443f-8b24-2398138772f2';
  const warehouseId = '90bba17c-3ee8-4007-ab3f-c4a6e772d6fc';
  const categoryId = '5417fa4c-f729-4aa4-ba19-f9d235817b18';

  console.log('Seeding serviceable address for user...');
  const address = await prisma.address.create({
    data: {
      userId,
      line1: '123 Test Street',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '501500',
      isDefault: true,
      addressType: 'PERMANENT',
      label: 'Home',
      location: { lat: 17.1763931, lng: 77.8822521 }
    }
  });
  console.log('Created address:', address);

  console.log('Seeding products...');
  const productsData = [
    {
      name: 'Fresh Organic Tomatoes',
      price: 30,
      finalPrice: 30,
      mrp: 35,
      stock: 200,
      isActive: true,
      status: 'APPROVED',
      unit: 'kg',
      slug: 'fresh-organic-tomatoes',
      isFeatured: true,
      warehouseId,
      categoryId
    },
    {
      name: 'Organic Carrots',
      price: 40,
      finalPrice: 40,
      mrp: 45,
      stock: 150,
      isActive: true,
      status: 'APPROVED',
      unit: 'kg',
      slug: 'organic-carrots',
      isFeatured: false,
      warehouseId,
      categoryId
    },
    {
      name: 'Fresh Green Apples',
      price: 120,
      finalPrice: 120,
      mrp: 140,
      stock: 100,
      isActive: true,
      status: 'APPROVED',
      unit: 'kg',
      slug: 'fresh-green-apples',
      isFeatured: true,
      warehouseId,
      categoryId
    }
  ];

  for (const item of productsData) {
    // Delete existing if it has the same slug for this warehouse
    await prisma.product.deleteMany({
      where: {
        warehouseId,
        slug: item.slug
      }
    });

    const product = await prisma.product.create({
      data: item
    });
    console.log(`Created product: ${product.name}`);
  }

  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
