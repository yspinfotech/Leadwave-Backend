// routes/userRoutes.js - FIXED VERSION
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const {
  createAdmin,
  createSalesperson,
  getAdmins,
  getUsers,
  getUserById,
  getSalesUsersForAssignment,
  deleteUser,
  updateUser,
} = require("../controllers/userController");

const ROLES = require("../config/roles");

/**
 * @route   POST /api/users/admin
 * @desc    SuperAdmin creates Admin
 * @access  SuperAdmin
 */
router.post("/admin", auth, authorize(ROLES.SUPERADMIN), createAdmin);

/**
 * @route   GET /api/users/admins
 * @desc    Get paginated list of Admin users (SuperAdmin only)
 */
router.get("/admins", auth, authorize(ROLES.SUPERADMIN), getAdmins);

/**
 * @route   POST /api/users/salesperson
 * @desc    Admin creates Salesperson
 * @access  Admin
 */
router.post("/salesperson", auth, authorize(ROLES.ADMIN), createSalesperson);

/**
 * @route   GET /api/users
 * @desc    Get users (Admin gets company users, SuperAdmin gets all)
 * @access  Admin, SuperAdmin
 */
// FIX: Use spread operator
router.get("/", auth, authorize(ROLES.ADMIN, ROLES.SUPERADMIN), getUsers);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Admin, SuperAdmin
 */
// FIX: Use spread operator
router.get("/:id", auth, authorize(ROLES.ADMIN, ROLES.SUPERADMIN), getUserById);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Admin, SuperAdmin
 */
// FIX: Use spread operator
router.put("/:id", auth, authorize(ROLES.ADMIN, ROLES.SUPERADMIN), updateUser);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user (soft delete)
 * @access  Admin, SuperAdmin
 */
// FIX: Use spread operator
router.delete(
  "/:id",
  auth,
  authorize(ROLES.ADMIN, ROLES.SUPERADMIN),
  deleteUser,
);

/**
 * @route   GET /api/users/for-assignment
 * @desc    Get sales users for lead assignment
 * @access  Admin
 */
router.get(
  "/for-assignment",
  auth,
  authorize(ROLES.ADMIN),
  getSalesUsersForAssignment,
);

module.exports = router;
