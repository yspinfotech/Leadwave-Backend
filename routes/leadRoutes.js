const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const upload = require("../middleware/upload");

const ROLES = require("../config/roles");

const {
  createLeadFromForm,
  getLeads,
  getAssignedLeads,
  assignLead,
  updateLead,
  getSingleLead,
  updateLeadBySalesperson,
  deleteLead,
  filterLeads,
  filterAllLeads,
  exportLeads
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

router.get("/single/:id", auth, getSingleLead);

/**
 * =========================
 * GET LEADS ASSIGNED TO USER (PAGINATED)
 * =========================
 * GET /api/leads/assigned?page=1&limit=10
 */
router.get("/assigned", auth, getAssignedLeads);

/**
 * =========================
 * ADMIN – ASSIGN LEAD
 * =========================
 * PUT /api/leads/:id/assign
 */
router.put("/:id/assign", auth, authorize(ROLES.ADMIN), assignLead);

/**
 * =========================
 * UPDATE LEAD
 * =========================
 * PUT /api/leads/:id
 */

/**
 * =========================
 * SALESPERSON - UPDATE OWN ASSIGNED LEAD
 * =========================
 * PUT /api/leads/update-by-salesperson
 */
router.put(
  "/update-by-salesperson",
  auth,
  authorize(ROLES.SALESPERSON),
  updateLeadBySalesperson,
);

/**
 * =========================
 * UPDATE LEAD
 * =========================
 * PUT /api/leads/:id
 */
router.put("/:id", auth, authorize(ROLES.ADMIN, ROLES.SALESPERSON), updateLead);

/**
 * =========================
 * SALESPERSON - UPDATE OWN ASSIGNED LEAD
 * =========================
 * PUT /api/leads/update-by-salesperson
 */
router.put(
  "/update-by-salesperson",
  auth,
  authorize(ROLES.SALESPERSON),
  updateLeadBySalesperson,
);

/**
 * =========================
 * DELETE LEAD
 * =========================
 * DELETE /api/leads/:id
 */
router.delete("/:id", auth, authorize(ROLES.ADMIN), deleteLead);

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




// Filter with pagination (for listing)
router.get('/filter', auth, authorize(ROLES.ADMIN), filterLeads);

// Filter ALL without pagination (for export)
router.get('/filter-all', auth, authorize(ROLES.ADMIN), filterAllLeads);

// Export filtered leads
router.get('/export', auth, authorize(ROLES.ADMIN), exportLeads);




module.exports = router;
