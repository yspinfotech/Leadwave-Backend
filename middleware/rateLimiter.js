const rateLimit = require("express-rate-limit");

/**
 * Rate limiter for auth routes (login protection)
 * Prevents brute-force attacks
 */
const loginLimiter = rateLimit({
  windowMs: 1 * 1 * 1000, // 15 minutes
  max: 5, // 5 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes.",
  },
});

module.exports = {
  loginLimiter,
};
