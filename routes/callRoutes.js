const express = require("express");
const router = express.Router();

const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const auth = require("../middleware/auth");
const authorize = require("../middleware/authorize");
const ROLES = require("../config/roles");
const {
  createCall,
  getCallsByLead,
  getCallsBySalesperson,
  getCalls,
} = require("../controllers/callController");

// Salesperson creates a call record
router.post(
  "/",
  auth,
  authorize(ROLES.SALESPERSON),
  upload.single("recording"),
  createCall,
);

// Get calls for a lead (salesperson or admin)
router.get("/lead/:leadId", auth, getCallsByLead);

// Admin: get calls by salesperson
router.get(
  "/salesperson/:userId",
  auth,
  authorize(ROLES.ADMIN),
  getCallsBySalesperson,
);

// Admin overview
router.get("/", auth, authorize(ROLES.ADMIN), getCalls);

module.exports = router;
