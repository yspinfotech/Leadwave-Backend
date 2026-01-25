const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const upload = require("../middleware/upload");

const ROLES = require("../config/roles");

const {
  createLeadFromForm,
  getLeads,
} = require("../controllers/leadController");

const { importLeads } = require("../controllers/leadImportController");

/**
 * =========================
 * ADMIN – ADD LEAD (FORM)
 * =========================
 * POST /api/leads
 */
router.post("/", auth, authorize(ROLES.ADMIN), createLeadFromForm);

/**
 * =========================
 * GET LEADS (PAGINATED)
 * =========================
 * GET /api/leads?page=1
 */
router.get("/", auth, getLeads);

/**
 * =========================
 * ADMIN – IMPORT LEADS (CSV/XLSX)
 * =========================
 * POST /api/leads/import
 */
router.post(
  "/import",
  auth,
  authorize(ROLES.ADMIN),
  upload.single("file"),
  importLeads,
);

module.exports = router;
