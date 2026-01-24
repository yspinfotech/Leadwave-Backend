const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const { createCompany } = require("../controllers/companyController");
const ROLES = require("../config/roles");

/**
 * @route   POST /api/companies
 * @desc    Create company
 * @access  SuperAdmin only
 */

router.post("/", auth, authorize(ROLES.SUPERADMIN), createCompany);

module.exports = router;
