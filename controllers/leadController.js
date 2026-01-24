const Lead = require("../models/Lead");
const { LEAD_SOURCE, LEAD_STATUS } = require("../config/leadEnums");

/**
 * @route   POST /api/leads
 * @desc    Admin adds lead from form
 * @access  Admin only
 */
exports.createLeadFromForm = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, alt_phone } = req.body;

    /* =====================
       VALIDATION
    ===================== */
    if (!firstName || !lastName || !phone) {
      return res.status(400).json({
        success: false,
        message: "First name, last name and phone are required",
      });
    }

    /* =====================
       DUPLICATE CHECK
       (same company + phone)
    ===================== */
    const existingLead = await Lead.findOne({
      companyId: req.user.companyId,
      phone,
      isDeleted: false,
    });

    if (existingLead) {
      return res.status(409).json({
        success: false,
        message: "Lead with this phone already exists",
      });
    }

    /* =====================
       CREATE LEAD
    ===================== */
    const lead = await Lead.create({
      firstName,
      lastName,
      email,
      phone,
      alt_phone,

      leadSource: LEAD_SOURCE.WEBSITE, // default for form
      leadStatus: LEAD_STATUS.NEW,

      companyId: req.user.companyId,

      assigned_to: null,
      assigned_by: null,
    });

    res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: lead,
    });
  } catch (error) {
    console.error("Create Lead Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
