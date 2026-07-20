const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { getPlatforms } = require('../controllers/platformController');

router.use(requireAuth);
router.get('/', getPlatforms);

module.exports = router;