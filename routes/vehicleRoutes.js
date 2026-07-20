const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { createVehicle, getMyVehicles } = require('../controllers/vehicleController');

router.use(requireAuth); // every route below this line requires a valid token

router.post('/', createVehicle);
router.get('/', getMyVehicles);

module.exports = router;