const prisma = require('../utils/prismaClient');
const { getTimeOfDayBucket, getDayType, computeSlotScore } = require('../utils/recommendationEngine');

const HALF_LIFE_DAYS = 14;
const MIN_TRIPS_FOR_CONFIDENCE = 3;

function getPeriodBounds(periodType) {
  const now = new Date();
  if (periodType === 'daily') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  const start = new Date(now);
  const day = start.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  start.setDate(start.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

async function setGoal(req, res) {
  try {
    const { periodType, targetAmount } = req.body;
    if (!['daily', 'weekly'].includes(periodType) || !targetAmount || targetAmount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid periodType ("daily" or "weekly") and a positive targetAmount are required',
      });
    }

    await prisma.goal.updateMany({
      where: { userId: req.user.id, isActive: true },
      data: { isActive: false },
    });

    const goal = await prisma.goal.create({
      data: { userId: req.user.id, periodType, targetAmount, isActive: true },
    });

    res.status(201).json({ status: 'ok', goal });
  } catch (err) {
    console.error('Goal error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getGoalStatus(req, res) {
  try {
    const goal = await prisma.goal.findFirst({
      where: { userId: req.user.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!goal) {
      return res.json({ status: 'ok', hasGoal: false });
    }

    const { start, end } = getPeriodBounds(goal.periodType);
    const now = new Date();

    const periodTrips = await prisma.trip.findMany({
      where: { userId: req.user.id, tripDate: { gte: start, lt: end } },
    });
    const achievedSoFar = periodTrips.reduce((sum, t) => sum + Number(t.netEarning || 0), 0);

    const trailingStart = new Date(now);
    trailingStart.setDate(trailingStart.getDate() - 30);
    const trailingTrips = await prisma.trip.findMany({
      where: { userId: req.user.id, tripDate: { gte: trailingStart, lte: now } },
    });

    const activeDays = new Set(trailingTrips.map((t) => new Date(t.tripDate).toDateString()));
    const totalTrailingNet = trailingTrips.reduce((sum, t) => sum + Number(t.netEarning || 0), 0);
    const avgNetPerActiveDay = activeDays.size > 0 ? totalTrailingNet / activeDays.size : 0;
    const activeDayRatio = activeDays.size / 30;

    const msRemaining = end.getTime() - now.getTime();
    const daysRemaining = Math.max(0, msRemaining / (1000 * 60 * 60 * 24));
    const expectedRemainingActiveDays = daysRemaining * activeDayRatio;
    const projectedRemaining = avgNetPerActiveDay * expectedRemainingActiveDays;
    const projectedTotal = achievedSoFar + projectedRemaining;

    const target = Number(goal.targetAmount);
    const onTrack = projectedTotal >= target;
    const shortfall = Math.max(0, target - projectedTotal);

    const allTrips = await prisma.trip.findMany({
      where: { userId: req.user.id },
      include: { platform: true },
    });

    const groups = {};
    for (const trip of allTrips) {
      const hour = new Date(trip.startTime).getUTCHours();
      const timeOfDay = getTimeOfDayBucket(hour);
      const dayType = getDayType(trip.dayOfWeek);
      const key = `${trip.platformId}|${dayType}|${timeOfDay}`;
      if (!groups[key]) {
        groups[key] = { platformName: trip.platform.name, dayType, timeOfDay, trips: [] };
      }
      groups[key].trips.push(trip);
    }

    const topSlots = Object.values(groups)
      .map((g) => {
        const { weightedAvgNetPerKm, tripCount } = computeSlotScore(g.trips, HALF_LIFE_DAYS);
        return {
          platformName: g.platformName,
          dayType: g.dayType,
          timeOfDay: g.timeOfDay,
          weightedAvgNetPerKm,
          tripCount,
        };
      })
      .filter((s) => s.tripCount >= MIN_TRIPS_FOR_CONFIDENCE)
      .sort((a, b) => b.weightedAvgNetPerKm - a.weightedAvgNetPerKm)
      .slice(0, 3);

    res.json({
      status: 'ok',
      hasGoal: true,
      periodType: goal.periodType,
      targetAmount: target,
      achievedSoFar: Math.round(achievedSoFar * 100) / 100,
      projectedTotal: Math.round(projectedTotal * 100) / 100,
      onTrack,
      shortfall: Math.round(shortfall * 100) / 100,
      topSlots,
    });
  } catch (err) {
    console.error('Goal status error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { setGoal, getGoalStatus };