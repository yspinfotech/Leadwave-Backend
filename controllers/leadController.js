const mongoose = require("mongoose");
const Lead = require("../models/Lead");
const { LEAD_SOURCE, LEAD_STATUS } = require("../config/leadEnums");
const User = require("../models/User");
const ROLES = require("../config/roles");
const XLSX = require("xlsx");
const { Parser } = require('json2csv');
// controllers/leadController.js - Updated createLeadFromForm
/**
 * @route   POST /api/leads
 * @desc    Admin adds lead from form (with campaign support)
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
      leadSource = "manual",
      tag,
      platform,
      activity,
      notes,
      campaign, // New: campaign ID
    } = req.body;

    /* =====================
       VALIDATION
    ===================== */
    if (!firstName || !lastName || !phone) {
      return res.status(400).json({
        success: false,
        message: "First name, last name and phone are required",
      });
    }

    // Validate campaign if provided
    if (campaign) {
      const campaignExists = await mongoose.model("Campaign").findOne({
        _id: campaign,
        companyId: req.user.companyId,
      });

      if (!campaignExists) {
        return res.status(400).json({
          success: false,
          message: "Invalid campaign selected",
        });
      }
    }

    // Check for duplicate lead
    const dupFilter = {
      companyId: req.user.companyId,
      isDeleted: false,
      phone: phone,
    };

    const existingLead = await Lead.findOne(dupFilter);

    if (existingLead) {
      // Update star for duplicate
      existingLead.star += 1;
      await existingLead.save();

      return res.status(200).json({
        success: true,
        message: "Existing lead found; star incremented",
        data: existingLead,
      });
    }

    /* =====================
       CREATE LEAD
    ===================== */
    const leadData = {
      firstName,
      lastName,
      email,
      phone,
      alt_phone,
      leadSource,
      tag,
      activity,
      platform,
      leadStatus: "new",
      companyId: req.user.companyId,
      campaign: campaign || null, // Add campaign
    };

    // Add note if provided
    if (notes) {
      leadData.notes = [{
        note_desc: notes,
        addedBy: req.user._id,
        createdTime: new Date(),
      }];
    }

    const lead = await Lead.create(leadData);

    // Update campaign stats if campaign is assigned
    if (campaign) {
      await mongoose.model("Campaign").findByIdAndUpdate(
        campaign,
        { $inc: { 'stats.totalLeads': 1 } }
      );
    }

    // Populate for response
    const populatedLead = await Lead.findById(lead._id)
      .populate("campaign", "name status")
      .populate("assigned_to", "name email");

    res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: populatedLead,
    });
  } catch (error) {
    console.error("Create Lead Error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Lead with this phone already exists",
      });
    }

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






/**
 * @route   GET /api/leads/filter
 * @desc    Filter leads with pagination (for UI display)
 * @access  Private
 */
exports.filterLeads = async (req, res) => {
  try {
    console.log('Filter leads request received:', req.query);
    console.log('User companyId:', req.user.companyId);

    if (!req.user.companyId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: User is not associated with any company'
      });
    }

    const {
      page = 1,
      limit = 10,
      sortBy = 'created',
      sortOrder = 'desc',
      ...filters
    } = req.query;

    // Build filter query - ALWAYS filter by companyId
    let filter = {
      companyId: req.user.companyId,
      isDeleted: false
    };

    // Apply additional filters
    filter = applyFilters(filter, filters);

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    // Build sort
    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort.created = -1;
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const total = await Lead.countDocuments(filter);
    
    // Fetch paginated leads
    const leads = await Lead.find(filter)
      .populate('assigned_to', 'name email')
      .populate('campaign', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalPages = Math.ceil(total / limitNum);

    console.log(`Found ${total} leads, showing ${leads.length} on page ${pageNum}`);

    res.status(200).json({
      success: true,
      count: leads.length,
      total,
      page: pageNum,
      totalPages,
      limit: limitNum,
      data: leads
    });

  } catch (error) {
    console.error('Filter leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to filter leads',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @route   GET /api/leads/filter-all
 * @desc    Filter ALL leads without pagination (for export)
 * @access  Private
 */
exports.filterAllLeads = async (req, res) => {
  try {
    console.log('Filter all leads request received:', req.query);
    
    if (!req.user.companyId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: User is not associated with any company'
      });
    }

    const {
      sortBy = 'created',
      sortOrder = 'desc',
      ...filters
    } = req.query;

    // Build filter query - ALWAYS filter by companyId
    let filter = {
      companyId: req.user.companyId,
      isDeleted: false
    };

    // Apply additional filters
    filter = applyFilters(filter, filters);

    // Build sort
    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort.created = -1;
    }

    console.log('Filter for all leads:', JSON.stringify(filter, null, 2));

    // Fetch ALL leads without pagination
    const leads = await Lead.find(filter)
      .populate('assigned_to', 'name email')
      .populate('campaign', 'name')
      .sort(sort)
      .lean();

    console.log(`Found ${leads.length} leads for export`);

    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads
    });

  } catch (error) {
    console.error('Filter all leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to filter leads',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @route   GET /api/leads/export
 * @desc    Export filtered leads as CSV or Excel
 * @access  Private
 */
exports.exportLeads = async (req, res) => {
  try {
    console.log('Export leads request received:', req.query);
    
    if (!req.user.companyId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: User is not associated with any company'
      });
    }

    const {
      format = 'excel',
      columns = 'all',
      ...filters
    } = req.query;

    // Build filter query - ALWAYS filter by companyId
    let filter = {
      companyId: req.user.companyId,
      isDeleted: false
    };

    // Apply filters
    filter = applyFilters(filter, filters);

    console.log('Export filter:', JSON.stringify(filter, null, 2));

    // Fetch ALL leads for export
    const leads = await Lead.find(filter)
      .populate('assigned_to', 'name email')
      .populate('campaign', 'name')
      .sort({ created: -1 })
      .lean();

    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No leads found with the given filters'
      });
    }

    console.log(`Exporting ${leads.length} leads`);

    // Prepare data for export
    const exportData = leads.map(lead => {
      const row = {
        'First Name': lead.firstName || '',
        'Last Name': lead.lastName || '',
        'Full Name': `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
        'Email': lead.email || '',
        'Phone': lead.phone || '',
        'Alternate Phone': lead.alt_phone || '',
        'Lead Status': lead.leadStatus || '',
        'Lead Source': lead.leadSource || '',
        'Tag': lead.tag || '',
        'Platform': lead.platform || '',
        'Activity': lead.activity || '',
        'Star Rating': lead.star || 1,
        'Assigned To': lead.assigned_to?.name || 'Unassigned',
        'Assigned Email': lead.assigned_to?.email || '',
        'Campaign': lead.campaign?.name || '',
        'Created Date': lead.created ? new Date(lead.created).toLocaleString() : '',
        'Updated Date': lead.updated ? new Date(lead.updated).toLocaleString() : '',
        'Notes Count': lead.notes?.length || 0,
        'Last Contacted': lead.last_contacted_date ? new Date(lead.last_contacted_date).toLocaleString() : '',
        'Next Followup': lead.next_followup_date ? new Date(lead.next_followup_date).toLocaleString() : '',
        'Expected Value': lead.expectedValue || 0,
        'Company ID': lead.companyId || ''
      };

      // Add notes if they exist
      if (lead.notes && lead.notes.length > 0) {
        row['Notes'] = lead.notes.map(note => note.note_desc).join(' | ');
      }

      return row;
    });

    // Filter columns if specified
    let finalData = exportData;
    if (columns !== 'all') {
      const selectedColumns = columns.split(',').map(col => col.trim());
      finalData = exportData.map(row => {
        const filteredRow = {};
        selectedColumns.forEach(col => {
          if (row[col] !== undefined) {
            filteredRow[col] = row[col];
          }
        });
        return filteredRow;
      });
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filterStr = Object.keys(filters).length > 0 ? '_filtered' : '';
    
    if (format === 'excel') {
      const filename = `leads_export_${timestamp}${filterStr}.xlsx`;
      
      // Create Excel workbook
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(finalData);
      
      // Auto-size columns
      const maxWidth = finalData.reduce((w, r) => Math.max(w, Object.keys(r).length), 10);
      worksheet['!cols'] = Array(maxWidth).fill({ wch: 20 });
      
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
      
      // Write to buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(excelBuffer);
      
    } else if (format === 'csv') {
      const filename = `leads_export_${timestamp}${filterStr}.csv`;
      
      // Convert to CSV
      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(finalData);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
      
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid format. Use "excel" or "csv"'
      });
    }

  } catch (error) {
    console.error('Export leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export leads',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


/**
 * Helper function to apply filters to query
 */
const applyFilters = (filter, query) => {
  const {
    search,
    leadStatus,
    leadSource,
    tag,
    platform,
    activity,
    dateRange,
    startDate,
    endDate,
    assignedStatus
  } = query;

  // Search filter (name, email, phone)
  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { alt_phone: { $regex: search, $options: 'i' } }
    ];
  }

  // Lead status filter
  if (leadStatus) {
    filter.leadStatus = leadStatus;
  }

  // Hierarchy filters
  if (leadSource) {
    filter.leadSource = leadSource;
  }
  if (tag) {
    filter.tag = tag;
  }
  if (platform) {
    filter.platform = platform;
  }
  if (activity) {
    filter.activity = activity;
  }

  // Date range filter
  const now = new Date();
  if (dateRange === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    filter.created = { $gte: today, $lt: tomorrow };
  } else if (dateRange === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    filter.created = { $gte: yesterday, $lt: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000) };
  } else if (dateRange === 'thisWeek') {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    filter.created = { $gte: startOfWeek };
  } else if (dateRange === 'lastWeek') {
    const today = new Date();
    const startOfLastWeek = new Date(today);
    startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
    startOfLastWeek.setHours(0, 0, 0, 0);
    const endOfLastWeek = new Date(startOfLastWeek);
    endOfLastWeek.setDate(endOfLastWeek.getDate() + 7);
    filter.created = { $gte: startOfLastWeek, $lt: endOfLastWeek };
  } else if (dateRange === 'thisMonth') {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    filter.created = { $gte: startOfMonth };
  } else if (dateRange === 'lastMonth') {
    const today = new Date();
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    filter.created = { $gte: startOfLastMonth, $lt: startOfThisMonth };
  } else if (dateRange === 'custom' && startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filter.created = { $gte: start, $lte: end };
  }

  // Assigned status filter
  if (assignedStatus === 'assigned') {
    filter.assigned_to = { $exists: true, $ne: null };
  } else if (assignedStatus === 'unassigned') {
    filter.assigned_to = { $eq: null };
  }

  return filter;
};