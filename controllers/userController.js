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
      role: ROLES.MANAGER,
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
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, mobile, city, role } = req.body;

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

    const UserData = await User.create({
      companyId: req.user.companyId, // Admin’s company
      name,
      email,
      password,
      mobile,
      city,
      role,
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: UserData,
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
exports.getUsers = async (req, res) => {
  try {
    let query = {};

    console.log('📋 User requesting:', {
      role: req.user.role,
      companyId: req.user.companyId,
      userId: req.user._id
    });

    // Manager can only see salespersons in their company
    if (req.user.role == ROLES.MANAGER) {
      query = {
        companyId: req.user.companyId,
        role: ROLES.SALESPERSON, // Managers only see salespersons
        isActive: true // Optional: only active users
      };
      console.log('👔 MANAGER query:', query);
    }
    // Admin can only see users from their company
    else if (req.user.role == ROLES.ADMIN) {
      query = {
        companyId: req.user.companyId,
        role: { $in: [ROLES.SALESPERSON, ROLES.MANAGER] }
      };
      console.log('👨‍💼 ADMIN query:', query);
    }
    // SuperAdmin can see all users except other superadmins
    else if (req.user.role == ROLES.SUPERADMIN) {
      query.role = { $ne: ROLES.SUPERADMIN };
      console.log('👑 SUPERADMIN query:', query);
    }
    // Other roles get no access
    else {
      console.log('🚫 No access for role:', req.user.role);
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const users = await User.find(query)
      .select("-password")
      .populate("companyId", "name")
      .sort({ createdTime: -1 });

    console.log(`✅ Found ${users.length} users for ${req.user.role}`);

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
      role: req.user.role
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Admin, SuperAdmin
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check permissions
    if (
      req.user.role === ROLES.ADMIN &&
      user.companyId.toString() !== req.user.companyId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
exports.getSelfProfile = async (req, res) => {
  try {

    const userId=req.user._id;
    console.log(userId);

     const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check permissions
    
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "server error", 
    });
  }
};

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Admin, SuperAdmin
 */
exports.updateUser = async (req, res) => {
  try {
    const { name, email, mobile, city, isActive } = req.body;

    // Find user
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check permissions
    if (
      req.user.role === ROLES.ADMIN &&
      user.companyId.toString() !== req.user.companyId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (mobile) user.mobile = mobile;
    if (city) user.city = city;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    const updatedUser = await User.findById(user._id).select("-password");

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updatedUser,
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
 * @route   DELETE /api/users/:id
 * @desc    Delete user (soft delete)
 * @access  Admin, SuperAdmin
 */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check permissions
    if (
      req.user.role === ROLES.ADMIN &&
      user.companyId.toString() !== req.user.companyId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Don't allow deleting superadmin
    if (user.role === ROLES.SUPERADMIN) {
      return res.status(403).json({
        success: false,
        message: "Cannot delete superadmin",
      });
    }

    // Soft delete - set isActive to false
    user.isActive = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
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
 * @route   GET /api/users/for-assignment
 * @desc    Get sales users for lead assignment
 * @access  Admin
 */
exports.getSalesUsersForAssignment = async (req, res) => {
  try {
    const users = await User.find({
      companyId: req.user.companyId,
      role: ROLES.SALESPERSON,
      isActive: true,
    })
      .select("name email mobile city")
      .sort({ name: 1 });

    console.log("Found users:", users.length);

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Error in getSalesUsersForAssignment:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
