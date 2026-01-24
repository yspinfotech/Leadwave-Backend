const express = require("express");
const router = express.Router();

const { login } = require("../controllers/authController");
const {
  refreshToken,
  logout,
} = require("../controllers/refreshTokenController");

const { loginLimiter } = require("../middleware/rateLimiter");
const auth = require("../middleware/auth");

/**
 * @route   POST /api/auth/login
 * @desc    Login & get access + refresh tokens
 * @access  Public
 */
router.post("/login", loginLimiter, login);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post("/refresh", refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout & revoke refresh token
 * @access  Private
 */
router.post("/logout", auth, logout);

module.exports = router;
