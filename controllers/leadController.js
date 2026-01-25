const mongoose = require("mongoose");
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
    if (!firstName || !lastName || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email and phone are required",
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

/**
 * @route   GET /api/leads
 * @desc    Get leads for the authenticated user's company (paginated)
 * @access  Authenticated users
 */
exports.getLeads = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const companyIdRaw = req.user && req.user.companyId;
    console.log("companyId (raw):", companyIdRaw, "type:", typeof companyIdRaw);

    // Try to cast companyId to ObjectId for reliable matching
    let companyId;
    try {
      companyId = mongoose.Types.ObjectId(companyIdRaw);
    } catch (e) {
      companyId = companyIdRaw;
    }

    // Match companyId whether stored as ObjectId or string
    const filter = {
      $and: [
        { isDeleted: false },
        {
          $or: [{ companyId }, { companyId: companyId.toString() }],
        },
      ],
    };
    console.log("Lead query filter:", JSON.stringify(filter));

    // Diagnostic: also check if any docs exist where companyId is stored as string
    const stringIdCount = await Lead.countDocuments({
      companyId: companyId.toString(),
      isDeleted: false,
    });
    console.log("Leads with companyId as string:", stringIdCount);

    const [total, leads] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.find(filter).sort({ created: -1 }).skip(skip).limit(limit),
    ]);
    console.log("Lead query total:", total);

    const totalPages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      success: true,
      data: leads,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get Leads Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
