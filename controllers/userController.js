const User = require("../models/User");
const ROLES = require("../config/roles");

/**
 * @route   POST /api/users/admin
 * @desc    SuperAdmin creates Admin
 * @access  SuperAdmin
 */
exports.createAdmin = async (req, res) => {
  try {
    const { companyId, name, email, password, mobile, city } = req.body;

    if (!companyId || !name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    const admin = await User.create({
      companyId,
      name,
      email,
      password,
      mobile,
      city,
      role: ROLES.ADMIN,
    });

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: admin,
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
 * @route   POST /api/users/salesperson
 * @desc    Admin creates Salesperson
 * @access  Admin
 */
exports.createSalesperson = async (req, res) => {
  try {
    const { name, email, password, mobile, city } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    const salesperson = await User.create({
      companyId: req.user.companyId, // Admin’s company
      name,
      email,
      password,
      mobile,
      city,
      role: ROLES.SALESPERSON,
    });

    res.status(201).json({
      success: true,
      message: "Salesperson created successfully",
      data: salesperson,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
