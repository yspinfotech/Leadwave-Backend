const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const {
  createCompany,
  getCompanies,
} = require("../controllers/companyController");
const ROLES = require("../config/roles");

/**
 * @route   POST /api/companies
 * @desc    Create company
 * @access  SuperAdmin only
 */

router.post("/", auth, authorize(ROLES.SUPERADMIN), createCompany);

/**
 * @route   GET /api/companies
 * @desc    Get paginated list of companies (SuperAdmin only)
 */
router.get("/", auth, authorize(ROLES.SUPERADMIN), getCompanies);

module.exports = router;
