const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { getAdminStats } = require('../controllers/adminController');

router.use(requireAuth, requireRole('admin'));
router.get('/stats', getAdminStats);

module.exports = router;