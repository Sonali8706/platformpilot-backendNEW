const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { createTrip, getMyTrips } = require('../controllers/tripController');

router.use(requireAuth);

router.post('/', createTrip);
router.get('/', getMyTrips);

module.exports = router;