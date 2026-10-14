require('dotenv').config();

const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const products = [
  {
    code: 'BRG-001',
    name: 'Industrial Ball Bearing',
    category: 'Bearings',
    unit: 'Piece',
    basePrice: 850,
    physicalQuantity: 120,
  },
  {
    code: 'MTR-001',
    name: 'Three-Phase Electric Motor',
    category: 'Motors',
    unit: 'Piece',
    basePrice: 18500,
    physicalQuantity: 15,
  },
  {
    code: 'PMP-001',
    name: 'Centrifugal Water Pump',
    category: 'Pumps',
    unit: 'Piece',
    basePrice: 12500,
    physicalQuantity: 20,
  },
  {
    code: 'VLV-001',
    name: 'Industrial Gate Valve',
    category: 'Valves',
    unit: 'Piece',
    basePrice: 2400,
    physicalQuantity: 60,
  },
  {
    code: 'BLT-001',
    name: 'Conveyor Belt',
    category: 'Conveyor Parts',
    unit: 'Meter',
    basePrice: 950,
    physicalQuantity: 200,
  },
  {
    code: 'FLT-001',
    name: 'Hydraulic Oil Filter',
    category: 'Filters',
    unit: 'Piece',
    basePrice: 650,
    physicalQuantity: 100,
  },
];

async function main() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
  }

  // 1. Hash the admin password before storing it.
  const passwordHash = await bcrypt.hash(
    process.env.ADMIN_PASSWORD,
    12
  );

  // 2. Create the admin if it does not already exist.
  const admin = await prisma.user.upsert({
    where: {
      email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
    },
    update: {},
    create: {
      name: process.env.ADMIN_NAME || 'ERP Administrator',
      email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log(`Admin ready: ${admin.email}`);

  // 3. Create each product and its inventory record.
  for (const productData of products) {
    const { physicalQuantity, ...productFields } = productData;

    const product = await prisma.product.upsert({
      where: { code: productFields.code },
      update: productFields,
      create: productFields,
    });

    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: {},
      create: {
        productId: product.id,
        physicalQuantity,
        reservedQuantity: 0,
      },
    });

    console.log(`Product ready: ${product.code}`);
  }

  console.log('ERP seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });