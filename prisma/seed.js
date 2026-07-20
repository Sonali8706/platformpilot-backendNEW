require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const platforms = [
    { name: 'Zomato', displayColor: '#E23744' },
    { name: 'Swiggy', displayColor: '#FC8019' },
    { name: 'Uber Eats', displayColor: '#06C167' },
    { name: 'Rapido', displayColor: '#FFDD00' },
    { name: 'Zepto', displayColor: '#8B5CF6' },
    { name: 'Blinkit', displayColor: '#FFC300' },
  ];

  for (const platform of platforms) {
    await prisma.platform.upsert({
      where: { name: platform.name },
      update: {},
      create: platform,
    });
  }
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const fuelPrices = [
    { fuelType: 'petrol', pricePerLitre: 106.50, effectiveDate: ninetyDaysAgo, city: null },
    { fuelType: 'diesel', pricePerLitre: 92.75, effectiveDate: ninetyDaysAgo, city: null },
    { fuelType: 'electric', pricePerLitre: 8.50, effectiveDate: ninetyDaysAgo, city: null },
  ];

  for (const price of fuelPrices) {
    await prisma.fuelPriceLog.create({ data: price });
  }

  console.log('Platforms seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });