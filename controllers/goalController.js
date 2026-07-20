const prisma = require('../utils/prismaClient');

function getPeriodBounds(periodType) {
  const now = new Date();
  if (periodType === 'daily') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  // weekly: Monday through Sunday
  const start = new Date(now);
  const day = start.getDay(); // 0 = Sunday ... 6 = Saturday
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

    // Only one active goal at a time — replacing an old one deactivates it rather than deleting it
    await prisma.goal.updateMany({
      where: { userId: req.user.id, isActive: true },
      data: { isActive: false },
    });

    const goal = await prisma.goal.create({
      data: { userId: req.user.id, periodType, targetAmount, isActive: true },
    });

    res.status(201).json({ status: 'ok', goal });
  } catch (err) {
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

    // How much has the rider already earned this period?
    const periodTrips = await prisma.trip.findMany({
      where: { userId: req.user.id, tripDate: { gte: start, lt: end } },
    });
    const achievedSoFar = periodTrips.reduce((sum, t) => sum + Number(t.netEarning || 0), 0);

    // Establish a realistic "per active working day" earning rate from the trailing 30 days
    const trailingStart = new Date(now);
    trailingStart.setDate(trailingStart.getDate() - 30);
    const trailingTrips = await prisma.trip.findMany({
      where: { userId: req.user.id, tripDate: { gte: trailingStart, lte: now } },
    });

    const activeDays = new Set(trailingTrips.map((t) => new Date(t.tripDate).toDateString()));
    const totalTrailingNet = trailingTrips.reduce((sum, t) => sum + Number(t.netEarning || 0), 0);
    const avgNetPerActiveDay = activeDays.size > 0 ? totalTrailingNet / activeDays.size : 0;
    const activeDayRatio = activeDays.size / 30; // how often, historically, the rider actually works

    const msRemaining = end.getTime() - now.getTime();
    const daysRemaining = Math.max(0, msRemaining / (1000 * 60 * 60 * 24));
    const expectedRemainingActiveDays = daysRemaining * activeDayRatio;
    const projectedRemaining = avgNetPerActiveDay * expectedRemainingActiveDays;
    const projectedTotal = achievedSoFar + projectedRemaining;

    const target = Number(goal.targetAmount);
    const onTrack = projectedTotal >= target;
    const shortfall = Math.max(0, target - projectedTotal);

    // Reuse the same recency-weighted slot scoring as the main recommendation engine,
    // to point at exactly where extra trips would help close the gap
    const HALF_LIFE_DAYS = 14;
    const MIN_TRIPS_FOR_CONFIDENCE = 3;

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
    function recencyWeight(tripDate) {
      const daysAgo = (Date.now() - new Date(tripDate).getTime()) / (1000 * 60 * 60 * 24);
      return Math.pow(0.5, daysAgo / HALF_LIFE_DAYS);
    }

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
        let weightedSum = 0;
        let weightTotal = 0;
        for (const t of g.trips) {
          const netPerKm = Number(t.netEarning) / Number(t.distanceKm);
          const w = recencyWeight(t.tripDate);
          weightedSum += netPerKm * w;
          weightTotal += w;
        }
        return {
          platformName: g.platformName,
          dayType: g.dayType,
          timeOfDay: g.timeOfDay,
          weightedAvgNetPerKm: Math.round((weightTotal > 0 ? weightedSum / weightTotal : 0) * 100) / 100,
          tripCount: g.trips.length,
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
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { setGoal, getGoalStatus };