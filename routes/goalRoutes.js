const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { setGoal, getGoalStatus } = require('../controllers/goalController');

router.use(requireAuth);
router.post('/', setGoal);
router.get('/status', getGoalStatus);

module.exports = router;