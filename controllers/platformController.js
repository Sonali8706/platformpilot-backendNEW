const prisma = require('../utils/prismaClient');

async function getPlatforms(req, res) {
  try {
    const platforms = await prisma.platform.findMany({ where: { isActive: true } });
    res.json({ status: 'ok', platforms });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { getPlatforms };