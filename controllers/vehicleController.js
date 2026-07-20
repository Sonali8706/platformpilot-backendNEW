const prisma = require('../utils/prismaClient');

async function createVehicle(req, res) {
  try {
    const { vehicleType, fuelEfficiencyKmpl, fuelType } = req.body;

    if (!vehicleType || !fuelEfficiencyKmpl || !fuelType) {
      return res.status(400).json({
        status: 'error',
        message: 'vehicleType, fuelEfficiencyKmpl, and fuelType are required',
      });
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        userId: req.user.id,
        vehicleType,
        fuelEfficiencyKmpl,
        fuelType,
      },
    });

    res.status(201).json({ status: 'ok', vehicle });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getMyVehicles(req, res) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: req.user.id, isActive: true },
    });
    res.json({ status: 'ok', vehicles });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { createVehicle, getMyVehicles };