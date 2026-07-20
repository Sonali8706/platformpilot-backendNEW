const prisma = require('../utils/prismaClient');

async function createTrip(req, res) {
  try {
    const { platformId, vehicleId, tripDate, startTime, distanceKm, earnings } = req.body;

    if (!platformId || !vehicleId || !tripDate || !startTime || !distanceKm || !earnings) {
      return res.status(400).json({
        status: 'error',
        message: 'platformId, vehicleId, tripDate, startTime, distanceKm, and earnings are all required',
      });
    }

    // Confirm the vehicle actually belongs to this rider
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId: req.user.id },
    });
    if (!vehicle) {
      return res.status(404).json({ status: 'error', message: 'Vehicle not found for this account' });
    }

    const parsedDate = new Date(tripDate); // expects "YYYY-MM-DD"
    const dayOfWeek = parsedDate.getDay(); // 0 = Sunday ... 6 = Saturday

    // Find the most recent fuel price on or before this trip's date, for this vehicle's fuel type
    const fuelPrice = await prisma.fuelPriceLog.findFirst({
      where: {
        fuelType: vehicle.fuelType,
        effectiveDate: { lte: parsedDate },
      },
      orderBy: { effectiveDate: 'desc' },
    });

    if (!fuelPrice) {
      return res.status(400).json({
        status: 'error',
        message: `No fuel price available for fuel type "${vehicle.fuelType}" on or before ${tripDate}`,
      });
    }

    const efficiency = Number(vehicle.fuelEfficiencyKmpl);
    const pricePerLitre = Number(fuelPrice.pricePerLitre);
    const distance = Number(distanceKm);
    const earningsNum = Number(earnings);

    const fuelCostEstimated = (distance / efficiency) * pricePerLitre;
    const netEarning = earningsNum - fuelCostEstimated;

    const trip = await prisma.trip.create({
      data: {
        userId: req.user.id,
        platformId,
        vehicleId,
        tripDate: parsedDate,
        startTime: new Date(`1970-01-01T${startTime}:00.000Z`), // expects "HH:MM"
        dayOfWeek,
        distanceKm: distance,
        earnings: earningsNum,
        fuelCostEstimated,
        netEarning,
      },
    });

    res.status(201).json({ status: 'ok', trip });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getMyTrips(req, res) {
  try {
    const { platformId, startDate, endDate } = req.query;

    const where = { userId: req.user.id };
    if (platformId) where.platformId = platformId;
    if (startDate || endDate) {
      where.tripDate = {};
      if (startDate) where.tripDate.gte = new Date(startDate);
      if (endDate) where.tripDate.lte = new Date(endDate);
    }

    const trips = await prisma.trip.findMany({
      where,
      include: { platform: true },
      orderBy: { tripDate: 'desc' },
    });

    res.json({ status: 'ok', count: trips.length, trips });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { createTrip, getMyTrips };