const mongoose = require("mongoose");
const CallLog = require("../models/CallLog");
const Lead = require("../models/Lead");
const User = require("../models/User");
const ROLES = require("../config/roles");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.createCall = async (req, res) => {
  try {
    // When using FormData/Multer, text fields are in req.body
    let { leadId, callTime, durationSeconds, callStatus, callType, notes } =
      req.body;

    let recordingLink = req.body.recordingLink || null;

    // 1. Handle File Upload to Cloudinary if a file is present
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          resource_type: "video", // 'video' handles audio files in Cloudinary
          folder: "call_recordings",
        });
        recordingLink = result.secure_url;

        // Delete local temp file
        fs.unlinkSync(req.file.path);
      } catch (uploadError) {
        console.error("Cloudinary Upload Error:", uploadError);
        // Fallback or handle error
      }
    }

    if (!leadId)
      return res
        .status(400)
        .json({ success: false, message: "leadId is required" });

    // ... (Validation and Lead Checks - Keep your existing logic) ...
    const lead = await Lead.findOne({ _id: leadId, isDeleted: false });
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    // 2. Create the Call Log with the new Recording Link
    const callLog = await CallLog.create({
      leadId,
      userId: req.user._id,
      companyId: req.user.companyId,
      callTime: callTime ? new Date(callTime) : new Date(),
      durationSeconds: parseInt(durationSeconds) || 0,
      callStatus: callStatus || null,
      callType: callType || null,
      recordingLink: recordingLink, // This will now be the Cloudinary URL
      notes: notes || "",
    });

    return res.status(201).json({ success: true, data: callLog });
  } catch (error) {
    console.error("Create Call Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
// GET /api/calls/lead/:leadId
// Get all calls for a lead (company-scoped). Salesperson can access only if assigned, Admin can access all.
exports.getCallsByLead = async (req, res) => {
  try {
    const { leadId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid leadId" });
    }

    const lead = await Lead.findOne({ _id: leadId, isDeleted: false });
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    const userCompany = req.user.companyId && req.user.companyId.toString();
    const leadCompany = lead.companyId && lead.companyId.toString();
    if (userCompany !== leadCompany) {
      return res.status(403).json({
        success: false,
        message: "Lead does not belong to your company",
      });
    }

    if (req.user.role === ROLES.SALESPERSON) {
      const userIdStr = req.user._id && req.user._id.toString();
      const assignedToStr = lead.assigned_to && lead.assigned_to.toString();
      if (!assignedToStr || assignedToStr !== userIdStr) {
        return res
          .status(403)
          .json({ success: false, message: "Access denied" });
      }
    }

    const calls = await CallLog.find({ leadId }).sort({ callTime: -1 });
    return res.status(200).json({ success: true, data: calls });
  } catch (error) {
    console.error("Get Calls By Lead Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/calls/salesperson/:userId
// Admin view: calls by a salesperson with optional date range (start, end)
exports.getCallsBySalesperson = async (req, res) => {
  try {
    const { userId } = req.params;
    const { start, end, page = 1, limit = 50 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid userId" });
    }

    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const companyId = req.user.companyId;
    const filter = { userId, companyId };

    if (start) {
      filter.callTime = filter.callTime || {};
      filter.callTime.$gte = new Date(start);
    }
    if (end) {
      filter.callTime = filter.callTime || {};
      filter.callTime.$lte = new Date(end);
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [total, calls] = await Promise.all([
      CallLog.countDocuments(filter),
      CallLog.find(filter)
        .populate("userId", "name email mobile role")
        .populate("leadId")
        .sort({ callTime: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
    ]);

    return res.status(200).json({
      success: true,
      data: calls,
      meta: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
    });
  } catch (error) {
    console.error("Get Calls By Salesperson Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getCallsReports = async (req, res) => {
  try {
  
    const  userId  = req.user._id;
   
    const { start, end, page = 1, limit = 50 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid userId" });
    }

    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const companyId = req.user.companyId;
    const filter = { userId, companyId };

    if (start) {
      filter.callTime = filter.callTime || {};
      filter.callTime.$gte = new Date(start);
    }
    if (end) {
      filter.callTime = filter.callTime || {};
      filter.callTime.$lte = new Date(end);
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [total, calls] = await Promise.all([
      CallLog.countDocuments(filter),
      CallLog.find(filter)
        .populate("userId", "name email mobile role")
        .populate("leadId")
        .sort({ callTime: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
    ]);

    return res.status(200).json({
      success: true,
      data: calls,
      meta: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
    });
  } catch (error) {
    console.error("Get Calls By Salesperson Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/calls
// Admin overview: filter by date range, salesperson, lead
exports.getCalls = async (req, res) => {
  try {
    const { start, end, userId, leadId, page = 1, limit = 50 } = req.query;
    const companyId = req.user.companyId;

    const filter = { companyId };
    if (userId && mongoose.Types.ObjectId.isValid(userId))
      filter.userId = userId;
    if (leadId && mongoose.Types.ObjectId.isValid(leadId))
      filter.leadId = leadId;
    if (start) {
      filter.callTime = filter.callTime || {};
      filter.callTime.$gte = new Date(start);
    }
    if (end) {
      filter.callTime = filter.callTime || {};
      filter.callTime.$lte = new Date(end);
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [total, calls] = await Promise.all([
      CallLog.countDocuments(filter),
      CallLog.find(filter)
        .populate("userId", "name email mobile role")
        .populate("leadId")
        .sort({ callTime: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
    ]);

    return res.status(200).json({
      success: true,
      data: calls,
      meta: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
    });
  } catch (error) {
    console.error("Get Calls Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};