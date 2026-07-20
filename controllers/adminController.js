const prisma = require('../utils/prismaClient');

async function getAdminStats(req, res) {
  try {
    const totalRiders = await prisma.user.count({ where: { role: 'rider' } });
    const trips = await prisma.trip.findMany({ include: { platform: true } });

    let totalDistanceKm = 0;
    let totalNetEarnings = 0;
    const platformMap = {};

    for (const t of trips) {
      const distance = Number(t.distanceKm);
      const net = Number(t.netEarning || 0);
      totalDistanceKm += distance;
      totalNetEarnings += net;

      const name = t.platform?.name || 'Unknown';
      if (!platformMap[name]) {
        platformMap[name] = { platformName: name, tripCount: 0, totalNet: 0, totalKm: 0 };
      }
      platformMap[name].tripCount += 1;
      platformMap[name].totalNet += net;
      platformMap[name].totalKm += distance;
    }

    const avgNetPerKm = totalDistanceKm > 0 ? totalNetEarnings / totalDistanceKm : 0;

    const platformBreakdown = Object.values(platformMap)
      .map((p) => ({
        platformName: p.platformName,
        tripCount: p.tripCount,
        avgNetPerKm: p.totalKm > 0 ? Math.round((p.totalNet / p.totalKm) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.avgNetPerKm - a.avgNetPerKm);

    res.json({
      status: 'ok',
      totalRiders,
      totalTrips: trips.length,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      totalNetEarnings: Math.round(totalNetEarnings * 100) / 100,
      avgNetPerKm: Math.round(avgNetPerKm * 100) / 100,
      platformBreakdown,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { getAdminStats };