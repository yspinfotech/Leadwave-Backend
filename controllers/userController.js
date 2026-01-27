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

/**
 * @route   GET /api/users/admins
 * @desc    Get paginated list of Admin users
 * @access  SuperAdmin only
 */
exports.getAdmins = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const filter = { role: ROLES.ADMIN };
    const total = await User.countDocuments(filter);
    const pages = Math.ceil(total / limit);

    const admins = await User.find(filter)
      .select("-password")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      data: admins,
      pagination: { total, page, pages, limit },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
