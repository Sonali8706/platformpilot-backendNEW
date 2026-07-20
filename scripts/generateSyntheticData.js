require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('../utils/prismaClient');

const DEMO_EMAIL = 'demo.rider@platformpilot.test';
const DEMO_PASSWORD = 'demo1234';
const NUM_DAYS = 60;
const FUEL_EFFICIENCY_KMPL = 45;
const FUEL_PRICE_PER_LITRE = 106.5; // matches the seeded petrol price

function getTimeOfDayBucket(hour) {
  if (hour >= 0 && hour < 6) return 'Early Morning';
  if (hour >= 6 && hour < 11) return 'Morning';
  if (hour >= 11 && hour < 16) return 'Afternoon';
  if (hour >= 16 && hour < 21) return 'Evening';
  return 'Night';
}

function getDayType(dayOfWeek) {
  return (dayOfWeek === 0 || dayOfWeek === 6) ? 'Weekend' : 'Weekday';
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

// The core "personality" of each platform — this is the pattern the
// recommendation engine is supposed to discover from the generated data.
function getBaseRatePerKm(platformName, dayType, timeOfDay) {
  let base = 10; // baseline ₹ per km for any platform, any slot

  if (platformName === 'Zomato') {
    if (timeOfDay === 'Evening') base = 16;
    else if (dayType === 'Weekend') base = 14;
    else base = 9;
  } else if (platformName === 'Swiggy') {
    if (timeOfDay === 'Afternoon' && dayType === 'Weekday') base = 15;
    else base = 9.5;
  } else if (platformName === 'Rapido') {
    if (timeOfDay === 'Morning') base = 12; // commute-hour boost
    else base = 9;
  } else {
    base = randomBetween(8, 11); // other platforms stay near flat baseline
  }

  return base;
}

async function ensureDemoUser() {
  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        passwordHash,
        fullName: 'Demo Rider',
        role: 'rider',
        city: 'Ghaziabad',
      },
    });
    console.log(`Created demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } else {
    console.log(`Using existing demo user: ${DEMO_EMAIL}`);
  }
  return user;
}

async function ensureDemoVehicle(userId) {
  let vehicle = await prisma.vehicle.findFirst({ where: { userId, isActive: true } });
  if (!vehicle) {
    vehicle = await prisma.vehicle.create({
      data: {
        userId,
        vehicleType: 'bike',
        fuelEfficiencyKmpl: FUEL_EFFICIENCY_KMPL,
        fuelType: 'petrol',
      },
    });
    console.log('Created demo vehicle');
  }
  return vehicle;
}

async function main() {
  const user = await ensureDemoUser();
  const vehicle = await ensureDemoVehicle(user.id);
  const platforms = await prisma.platform.findMany({ where: { isActive: true } });

  if (platforms.length === 0) {
    console.error('No platforms found — run `npx prisma db seed` first.');
    process.exit(1);
  }

  let tripsCreated = 0;
  const today = new Date();

  for (let daysAgo = NUM_DAYS; daysAgo >= 0; daysAgo--) {
    const workedToday = Math.random() < 0.85; // ~85% of days the rider works
    if (!workedToday) continue;

    const tripDate = new Date(today);
    tripDate.setDate(tripDate.getDate() - daysAgo);
    const dayOfWeek = tripDate.getDay();
    const dayType = getDayType(dayOfWeek);

    const numTrips = randomInt(3, 8);

    for (let i = 0; i < numTrips; i++) {
      const hour = randomInt(6, 23); // riders active 6am - midnight
      const minute = randomInt(0, 59);
      const timeOfDay = getTimeOfDayBucket(hour);

      const platform = platforms[randomInt(0, platforms.length - 1)];
      const distanceKm = Math.round(randomBetween(2, 10) * 10) / 10;

      const baseRate = getBaseRatePerKm(platform.name, dayType, timeOfDay);
      const noise = randomBetween(-2, 2); // realistic variation, not a perfectly clean signal
      const ratePerKm = Math.max(4, baseRate + noise);

      const earnings = Math.round(distanceKm * ratePerKm * 100) / 100;
      const fuelCostEstimated = Math.round((distanceKm / FUEL_EFFICIENCY_KMPL) * FUEL_PRICE_PER_LITRE * 100) / 100;
      const netEarning = Math.round((earnings - fuelCostEstimated) * 100) / 100;

      const startTime = new Date(`1970-01-01T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);

      await prisma.trip.create({
        data: {
          userId: user.id,
          platformId: platform.id,
          vehicleId: vehicle.id,
          tripDate,
          startTime,
          dayOfWeek,
          distanceKm,
          earnings,
          fuelCostEstimated,
          netEarning,
        },
      });

      tripsCreated++;
    }
  }

  console.log(`Done. Created ${tripsCreated} synthetic trips over ${NUM_DAYS} days for ${DEMO_EMAIL}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });