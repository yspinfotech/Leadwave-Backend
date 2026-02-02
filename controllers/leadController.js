const mongoose = require("mongoose");
const Lead = require("../models/Lead");
const { LEAD_SOURCE, LEAD_STATUS } = require("../config/leadEnums");
const User = require("../models/User");
const ROLES = require("../config/roles");

/**
 * @route   POST /api/leads
 * @desc    Admin adds lead from form
 * @access  Admin only
 */
exports.createLeadFromForm = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      alt_phone,
      tag,
      activity,
      platform,
      leadSource,
    } = req.body;

    /* =====================
       VALIDATION
    ===================== */
    if (!firstName || !lastName || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email and phone are required",
      });
    }

    const dupFilter = {
      companyId: req.user.companyId,
      isDeleted: false,
      $or: [],
    };
    if (phone) dupFilter.$or.push({ phone });
    if (email) dupFilter.$or.push({ email });

    let existingLead = null;
    if (dupFilter.$or.length > 0) {
      existingLead = await Lead.findOneAndUpdate(
        dupFilter,
        { $inc: { start: 1 } },
        { new: true },
      );
    }

    if (existingLead) {
      return res.status(200).json({
        success: true,
        message: "Existing lead found; incremented start counter",
        data: existingLead,
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
      tag,
      activity,
      platform,
      leadSource,
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
 * @route   PUT /api/leads/:id
 * @desc    Update lead (Admin or assigned Salesperson)
 * @access  Admin or Salesperson
 */
exports.updateLead = async (req, res) => {
  try {
    const leadId = req.params.id;
    // validate leadId to avoid CastError when an invalid id is passed
    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid lead id" });
    }
    const allowed = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "alt_phone",
      "leadStatus",
      "expectedValue",
      "next_followup_date",
    ];

    const lead = await Lead.findOne({
      _id: leadId,
      companyId: req.user.companyId,
      isDeleted: false,
    });
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    // If salesperson, ensure they are assigned to this lead
    if (req.user.role === ROLES.SALESPERSON) {
      const userIdStr = req.user._id && req.user._id.toString();
      const assignedToStr = lead.assigned_to && lead.assigned_to.toString();
      if (!assignedToStr || assignedToStr !== userIdStr) {
        return res
          .status(403)
          .json({ success: false, message: "Access denied" });
      }
    }

    // Apply allowed updates
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) lead[k] = req.body[k];
    });

    await lead.save();
    res
      .status(200)
      .json({ success: true, message: "Lead updated", data: lead });
  } catch (error) {
    console.error("Update Lead Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @route   DELETE /api/leads/:id
 * @desc    Soft-delete a lead (Admin only)
 * @access  Admin
 */
exports.deleteLead = async (req, res) => {
  try {
    const leadId = req.params.id;
    const lead = await Lead.findOne({
      _id: leadId,
      companyId: req.user.companyId,
      isDeleted: false,
    });
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    lead.isDeleted = true;
    await lead.save();

    res.status(200).json({ success: true, message: "Lead deleted" });
  } catch (error) {
    console.error("Delete Lead Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @route   PUT /api/leads/:id/assign
 * @desc    Admin assigns a lead to a Salesperson
 * @access  Admin only
 */
exports.assignLead = async (req, res) => {
  try {
    const leadId = req.params.id;
    const { userId } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "assignedTo is required" });
    }

    // Verify assignee exists and is a Salesperson in the same company
    const assignee = await User.findById(userId);
    if (!assignee) {
      return res
        .status(404)
        .json({ success: false, message: "Assignee not found" });
    }

    if (assignee.role !== ROLES.SALESPERSON) {
      return res
        .status(400)
        .json({ success: false, message: "Assignee must be a Salesperson" });
    }

    const adminCompanyId = req.user.companyId && req.user.companyId.toString();
    const assigneeCompanyId =
      assignee.companyId && assignee.companyId.toString();
    if (adminCompanyId !== assigneeCompanyId) {
      return res.status(403).json({
        success: false,
        message: "Assignee does not belong to your company",
      });
    }

    // Find lead in the same company
    const lead = await Lead.findOne({
      _id: leadId,
      companyId: req.user.companyId,
      isDeleted: false,
    });
    if (!lead) {
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });
    }

    lead.assigned_to = assignee._id;
    lead.assigned_by = req.user._id;
    await lead.save();

    res.status(200).json({
      success: true,
      message: "Lead assigned successfully",
      data: lead,
    });
  } catch (error) {
    console.error("Assign Lead Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @route   PUT /api/leads/update-by-salesperson
 * @desc    Salesperson updates their assigned lead (limited fields)
 * @access  Salesperson only
 */
exports.updateLeadBySalesperson = async (req, res) => {
  try {
    const {
      leadId,
      status,
      followupdate,
      note_desc,
      expectedValue,
      contacted,
    } = req.body;

    if (!leadId) {
      return res
        .status(400)
        .json({ success: false, message: "leadId is required" });
    }

    // find lead in same company
    const lead = await Lead.findOne({
      _id: leadId,
      companyId: req.user.companyId,
      isDeleted: false,
    });
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    // ensure user is the assigned salesperson
    const userIdStr = req.user._id && req.user._id.toString();
    const assignedToStr = lead.assigned_to && lead.assigned_to.toString();
    if (!assignedToStr || assignedToStr !== userIdStr) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Update status if provided
    if (status !== undefined) lead.leadStatus = status;

    // Update next followup date if provided
    if (
      followupdate !== undefined &&
      followupdate !== null &&
      followupdate !== ""
    ) {
      lead.next_followup_date = new Date(followupdate);
    }

    // Add note if provided
    if (note_desc) {
      lead.notes = lead.notes || [];
      lead.notes.push({ note_desc, addedBy: req.user._id });
    }

    // assigned_by should be the userid from token
    lead.assigned_by = req.user._id;

    // expected value
    if (expectedValue !== undefined) lead.expectedValue = expectedValue;

    // last contacted date should be today's date only if contacted flag true
    if (contacted === true || contacted === "true") {
      lead.last_contacted_date = new Date();
    }

    await lead.save();

    res
      .status(200)
      .json({ success: true, message: "Lead updated", data: lead });
  } catch (error) {
    console.error("Update Lead By Salesperson Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
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

exports.getSingleLead = async (req, res) => {
  try {
    const leadId = req.params.id;
    // validate leadId to avoid CastError when an invalid id is passed
    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid lead id" });
    }

    const lead = await Lead.findOne({
      _id: leadId,
      companyId: req.user.companyId,
      isDeleted: false,
    });
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    if (req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    res
      .status(200)
      .json({ success: true, message: "lead fetched", data: lead });
  } catch (error) {
    console.error("lead feteching Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @route   GET /api/leads/assigned
 * @desc    Get leads assigned to the authenticated user (paginated)
 * @access  Authenticated users
 */
exports.getAssignedLeads = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const userIdRaw = req.user && req.user._id;
    const companyIdRaw = req.user && req.user.companyId;

    // Cast IDs when possible for reliable matching
    let userId;
    try {
      userId = mongoose.Types.ObjectId(userIdRaw);
    } catch (e) {
      userId = userIdRaw;
    }

    let companyId;
    try {
      companyId = mongoose.Types.ObjectId(companyIdRaw);
    } catch (e) {
      companyId = companyIdRaw;
    }

    const filter = {
      isDeleted: false,
      assigned_to: userId,
      $or: [{ companyId }, { companyId: companyId && companyId.toString() }],
    };

    const [total, leads] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.find(filter).sort({ created: -1 }).skip(skip).limit(limit),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      success: true,
      data: leads,
      meta: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error("Get Assigned Leads Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
