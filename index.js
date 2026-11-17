require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('./utils/prismaClient');
const authRoutes = require('./routes/authRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const tripRoutes = require('./routes/tripRoutes');
const platformRoutes = require('./routes/platformRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { requireAuth } = require('./middleware/authMiddleware');
const goalRoutes = require('./routes/goalRoutes');

const app = express();
app.set("trust proxy", 1);


const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map(origin => origin.trim());

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/goals', goalRoutes);


app.get('/health', async (req, res) => {
  try {
    const platformCount = await prisma.platform.count();
    res.json({
      status: 'ok',
      message: 'Server and database are both working',
      platformsInDatabase: platformCount,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ status: 'ok', loggedInAs: req.user });
});


const PORT = process.env.PORT || 4000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PlatformPilot backend running on port ${PORT}`);
});