
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { signup, login } = require("../controllers/authController");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many attempts. Please try again later."
  }
});

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);

module.exports = router;
