const prisma = require('../utils/prismaClient');
const { getTimeOfDayBucket, getDayType, computeSlotScore } = require('../utils/recommendationEngine');

const HALF_LIFE_DAYS = 14;
const MIN_TRIPS_FOR_CONFIDENCE = 3;

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

    const slots = Object.values(groups).map((group) => {
      const { weightedAvgNetPerKm, tripCount } = computeSlotScore(group.trips, HALF_LIFE_DAYS);
      return {
        platformId: group.platformId,
        platformName: group.platformName,
        dayType: group.dayType,
        timeOfDay: group.timeOfDay,
        weightedAvgNetPerKm,
        tripCount,
        confident: tripCount >= MIN_TRIPS_FOR_CONFIDENCE,
      };
    });

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
    console.error('Recommendation error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { getRecommendations };