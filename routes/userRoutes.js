const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const {
  createAdmin,
  createSalesperson,
} = require("../controllers/userController");

const ROLES = require("../config/roles");

/**
 * @route   POST /api/users/admin
 * @desc    SuperAdmin creates Admin
 * @access  SuperAdmin
 */
router.post("/admin", auth, authorize(ROLES.SUPERADMIN), createAdmin);

/**
 * @route   POST /api/users/salesperson
 * @desc    Admin creates Salesperson
 * @access  Admin
 */
router.post("/salesperson", auth, authorize(ROLES.ADMIN), createSalesperson);

module.exports = router;
