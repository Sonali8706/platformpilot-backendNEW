const prisma = require('../utils/prismaClient');

const HALF_LIFE_DAYS = 14; // trips this many days old count for half as much
const MIN_TRIPS_FOR_CONFIDENCE = 3; // fewer than this, and we flag the slot as low-confidence

function getTimeOfDayBucket(hour) {
  if (hour >= 0 && hour < 6) return 'Early Morning';
  if (hour >= 6 && hour < 11) return 'Morning';
  if (hour >= 11 && hour < 16) return 'Afternoon';
  if (hour >= 16 && hour < 21) return 'Evening';
  return 'Night'; // 21-23
}

function getDayType(dayOfWeek) {
  // dayOfWeek: 0 = Sunday ... 6 = Saturday
  return (dayOfWeek === 0 || dayOfWeek === 6) ? 'Weekend' : 'Weekday';
}

function recencyWeight(tripDate, halfLifeDays) {
  const daysAgo = (Date.now() - new Date(tripDate).getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, daysAgo / halfLifeDays);
}

async function getRecommendations(req, res) {
  try {
    const trips = await prisma.trip.findMany({
      where: { userId: req.user.id },
      include: { platform: true },
    });

    if (trips.length === 0) {
      return res.json({
        status: 'ok',
        message: 'No trips logged yet — recommendations will appear once you log some trips.',
        slots: [],
      });
    }

    // Group trips into { platformId|dayType|timeOfDay -> [trips] }
    const groups = {};

    for (const trip of trips) {
      const hour = new Date(trip.startTime).getUTCHours();
      const timeOfDay = getTimeOfDayBucket(hour);
      const dayType = getDayType(trip.dayOfWeek);
      const key = `${trip.platformId}|${dayType}|${timeOfDay}`;

      if (!groups[key]) {
        groups[key] = {
          platformId: trip.platformId,
          platformName: trip.platform.name,
          dayType,
          timeOfDay,
          trips: [],
        };
      }
      groups[key].trips.push(trip);
    }

    // Turn each group into a weighted score
    const slots = Object.values(groups).map((group) => {
      let weightedSum = 0;
      let weightTotal = 0;

      for (const trip of group.trips) {
        const netPerKm = Number(trip.netEarning) / Number(trip.distanceKm);
        const weight = recencyWeight(trip.tripDate, HALF_LIFE_DAYS);
        weightedSum += netPerKm * weight;
        weightTotal += weight;
      }

      const weightedAvgNetPerKm = weightTotal > 0 ? weightedSum / weightTotal : 0;
      const tripCount = group.trips.length;

      return {
        platformId: group.platformId,
        platformName: group.platformName,
        dayType: group.dayType,
        timeOfDay: group.timeOfDay,
        weightedAvgNetPerKm: Math.round(weightedAvgNetPerKm * 100) / 100,
        tripCount,
        confident: tripCount >= MIN_TRIPS_FOR_CONFIDENCE,
      };
    });

    // Best score first, but only among confident slots for the top pick
    slots.sort((a, b) => b.weightedAvgNetPerKm - a.weightedAvgNetPerKm);
    const confidentSlots = slots.filter((s) => s.confident);
    const topPick = confidentSlots.length > 0 ? confidentSlots[0] : null;

    res.json({
      status: 'ok',
      halfLifeDays: HALF_LIFE_DAYS,
      minTripsForConfidence: MIN_TRIPS_FOR_CONFIDENCE,
      topPick,
      slots,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { getRecommendations };