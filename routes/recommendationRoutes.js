const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { getRecommendations } = require('../controllers/recommendationController');

router.use(requireAuth);

router.get('/', getRecommendations);

module.exports = router;