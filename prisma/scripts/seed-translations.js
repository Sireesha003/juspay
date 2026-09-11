import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const translationDictionary = {
  // Categories
  'Vegetables': {
    te: { name: 'కూరగాయలు' },
    hi: { name: 'सब्जियां' },
    mr: { name: 'भाज्या' }
  },
  'Fruits': {
    te: { name: 'పండ్లు' },
    hi: { name: 'फल' },
    mr: { name: 'फळे' }
  },
  'Groceries': {
    te: { name: 'కిరాణా సామాగ్రి' },
    hi: { name: 'किराना सामान' },
    mr: { name: 'किराणा माल' }
  },
  // Products
  'Fresh Organic Tomatoes': {
    te: { name: 'తాజా సేంద్రీయ టమోటాలు', description: 'సేంద్రీయ పొలాల నుండి నేరుగా సేకరించిన తాజా టమోటాలు.' },
    hi: { name: 'ताजा जैविक टमाटर', description: 'जैविक खेतों से सीधे प्राप्त ताजे टमाटर।' },
    mr: { name: 'ताजे सेंद्रिय टोमॅटो', description: 'सेंद्रिय शेतातून थेट आणलेले ताजे टोमॅटो.' }
  },
  'Organic Carrots': {
    te: { name: 'సేంద్రీయ క్యారెట్లు', description: 'తాజా మరియు తీపి సేంద్రీయ క్యారెట్లు.' },
    hi: { name: 'जैविक गाजर', description: 'ताजी और मीठी जैविक गाजर।' },
    mr: { name: 'सेंद्रिय गाजर', description: 'ताजी आणि गोड सेंद्रिय गाजर.' }
  },
  'Fresh Green Apples': {
    te: { name: 'తాజా పచ్చి ఆపిల్స్', description: 'రుచికరమైన మరియు కరకరలాడే పచ్చి ఆపిల్స్.' },
    hi: { name: 'ताजे हरे सेब', description: 'स्वादिष्ट और कुरकुरे हरे सेब।' },
    mr: { name: 'ताजी हिरवी सफरचंद', description: 'चवदार आणि कुरकुरीत हिरवी सफरचंद.' }
  }
};

async function seedTranslations() {
  console.log('--- Starting Translations Seeding ---');

  const languages = ['te', 'hi', 'mr'];

  // 1. Seed Categories
  const categories = await prisma.category.findMany();
  console.log(`Found ${categories.length} categories in DB.`);
  for (const category of categories) {
    const dictEntry = translationDictionary[category.name];
    for (const lang of languages) {
      const transData = dictEntry?.[lang] || { name: `${category.name} (${lang.toUpperCase()})` };
      await prisma.translation.upsert({
        where: {
          entityType_entityId_language: {
            entityType: 'Category',
            entityId: category.id,
            language: lang
          }
        },
        update: {
          translations: transData
        },
        create: {
          entityType: 'Category',
          entityId: category.id,
          language: lang,
          translations: transData
        }
      });
    }
  }
  console.log('Category translations seeded.');

  // 2. Seed SubCategories
  const subCategories = await prisma.subCategory.findMany();
  console.log(`Found ${subCategories.length} subcategories in DB.`);
  for (const sub of subCategories) {
    for (const lang of languages) {
      const transData = { name: `${sub.name} (${lang.toUpperCase()})` };
      await prisma.translation.upsert({
        where: {
          entityType_entityId_language: {
            entityType: 'SubCategory',
            entityId: sub.id,
            language: lang
          }
        },
        update: {
          translations: transData
        },
        create: {
          entityType: 'SubCategory',
          entityId: sub.id,
          language: lang,
          translations: transData
        }
      });
    }
  }
  console.log('SubCategory translations seeded.');

  // 3. Seed Products
  const products = await prisma.product.findMany();
  console.log(`Found ${products.length} products in DB.`);
  for (const product of products) {
    const dictEntry = translationDictionary[product.name];
    for (const lang of languages) {
      const transData = dictEntry?.[lang] || {
        name: `${product.name} (${lang.toUpperCase()})`,
        description: `${product.description || ''} (${lang.toUpperCase()})`
      };
      await prisma.translation.upsert({
        where: {
          entityType_entityId_language: {
            entityType: 'Product',
            entityId: product.id,
            language: lang
          }
        },
        update: {
          translations: transData
        },
        create: {
          entityType: 'Product',
          entityId: product.id,
          language: lang,
          translations: transData
        }
      });
    }
  }
  console.log('Product translations seeded.');

  // 4. Seed Banners
  const banners = await prisma.banner.findMany();
  console.log(`Found ${banners.length} banners in DB.`);
  for (const banner of banners) {
    for (const lang of languages) {
      const transData = {
        title: `${banner.title} (${lang.toUpperCase()})`,
        subtitle: banner.subtitle ? `${banner.subtitle} (${lang.toUpperCase()})` : undefined
      };
      await prisma.translation.upsert({
        where: {
          entityType_entityId_language: {
            entityType: 'Banner',
            entityId: banner.id,
            language: lang
          }
        },
        update: {
          translations: transData
        },
        create: {
          entityType: 'Banner',
          entityId: banner.id,
          language: lang,
          translations: transData
        }
      });
    }
  }
  console.log('Banner translations seeded.');

  // 5. Seed Brands
  const brands = await prisma.brand.findMany();
  console.log(`Found ${brands.length} brands in DB.`);
  for (const brand of brands) {
    for (const lang of languages) {
      const transData = {
        name: `${brand.name} (${lang.toUpperCase()})`,
        description: brand.description ? `${brand.description} (${lang.toUpperCase()})` : undefined
      };
      await prisma.translation.upsert({
        where: {
          entityType_entityId_language: {
            entityType: 'Brand',
            entityId: brand.id,
            language: lang
          }
        },
        update: {
          translations: transData
        },
        create: {
          entityType: 'Brand',
          entityId: brand.id,
          language: lang,
          translations: transData
        }
      });
    }
  }
  console.log('Brand translations seeded.');

  console.log('--- Seeding Translations Completed Successfully! ---');
}

seedTranslations()
  .catch((e) => {
    console.error('Error during translations seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
