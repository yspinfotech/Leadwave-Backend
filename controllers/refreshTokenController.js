const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/RefreshToken");
const User = require("../models/User");

/* Generate access token */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      companyId: user.companyId || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }, // short-lived
  );
};

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public (uses refresh token)
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token required",
      });
    }

    const storedToken = await RefreshToken.findOne({
      token: refreshToken,
      revoked: false,
      expiresAt: { $gt: new Date() },
    }).populate("user");

    if (!storedToken || !storedToken.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    // 🔁 Rotate refresh token (security best practice)
    storedToken.revoked = true;
    await storedToken.save();

    const newRefreshToken = crypto.randomBytes(40).toString("hex");

    await RefreshToken.create({
      user: storedToken.user._id,
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    const accessToken = generateAccessToken(storedToken.user);

    res.status(200).json({
      success: true,
      accessToken: `Bearer ${accessToken}`,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * @route   POST /api/auth/logout
 * @desc    Revoke refresh token
 * @access  Private
 */
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await RefreshToken.findOneAndUpdate(
        { token: refreshToken },
        { revoked: true },
      );
    }

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
