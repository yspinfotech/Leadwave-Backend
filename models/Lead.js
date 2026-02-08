const mongoose = require("mongoose");
const { LEAD_SOURCE, LEAD_STATUS } = require("../config/leadEnums");

const NoteSchema = new mongoose.Schema(
  {
    note_desc: {
      type: String,
      required: true,
      trim: true,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdTime: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const LeadSchema = new mongoose.Schema(
  {
    /* =====================
       BASIC INFO
    ===================== */
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    alt_phone: {
      type: String,
      trim: true,
    },

    /* =====================
       LEAD META
    ===================== */
    leadSource: {
      type: String,
      required: true,
      default: "file", // default for import
    },
    tag: {
      type: String,
      required: true,
    },
    platform: {
      type: String,
      required: true,
    },
    activity: {
      type: String,
      required: true,
    },
    leadStatus: {
      type: String,
      default: "new",
    },

    /* =====================
       CAMPAIGN RELATIONSHIP
    ===================== */
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      index: true,
    },

    /* =====================
       ASSIGNMENT
    ===================== */
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    assigned_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    /* =====================
       SALES DATA
    ===================== */
    expectedValue: {
      type: Number,
      default: null, // added by salesperson after contact
    },

    last_contacted_date: {
      type: Date,
      default: null,
    },

    next_followup_date: {
      type: Date,
      default: null,
    },

    /* =====================
       LEAD DISTRIBUTION DATA
       (For campaign-based distribution)
    ===================== */
    distributionData: {
      assignedBy: {
        type: String,
        enum: ["manual", "ondemand", "equal", "conditional"],
        default: "manual",
      },
      assignmentDate: {
        type: Date,
      },
      campaignAssignmentDate: {
        type: Date,
      },
      distributionRule: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      autoAssigned: {
        type: Boolean,
        default: false,
      },
    },

    /* =====================
       NOTES
    ===================== */
    notes: {
      type: [NoteSchema],
      default: [],
    },

    /* =====================
       IMPORT METRICS
    ===================== */
    star: {
      type: Number,
      default: 1,
    },

    /* =====================
       SYSTEM FIELDS
    ===================== */
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: {
      createdAt: "created",
      updatedAt: "updated",
    },
    versionKey: false,
  },
);

/* 🔍 Avoid duplicate leads per company */
LeadSchema.index(
  { companyId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

/* 🔍 Index for campaign queries */
LeadSchema.index({ campaign: 1, leadStatus: 1 });
LeadSchema.index({ campaign: 1, assigned_to: 1 });
LeadSchema.index({ campaign: 1, companyId: 1 });

/* 🔍 Compound index for performance */
LeadSchema.index({ 
  companyId: 1, 
  campaign: 1, 
  leadStatus: 1, 
  assigned_to: 1 
});

/* 📊 Virtual for full name */
LeadSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

/* 📊 Virtual for campaign stats */
LeadSchema.virtual("campaignInfo", {
  ref: "Campaign",
  localField: "campaign",
  foreignField: "_id",
  justOne: true,
});

/* 🏗️ Pre-save middleware */
LeadSchema.pre("save", function (next) {
  // Update distribution data when campaign is assigned
  if (this.isModified("campaign") && this.campaign) {
    this.distributionData.campaignAssignmentDate = new Date();
    this.distributionData.assignedBy = "ondemand"; // Default for campaign assignment
  }
  
  // Update assignment date when assigned_to changes
  if (this.isModified("assigned_to") && this.assigned_to) {
    this.distributionData.assignmentDate = new Date();
    this.distributionData.autoAssigned = this.distributionData.assignedBy !== "manual";
  }
  
  next();
});

/* 🔄 Methods */
LeadSchema.methods.assignToCampaign = async function (campaignId, assignmentType = "ondemand") {
  this.campaign = campaignId;
  this.distributionData.assignedBy = assignmentType;
  this.distributionData.campaignAssignmentDate = new Date();
  return this.save();
};

LeadSchema.methods.assignToAgent = async function (agentId, assignmentType = "manual") {
  this.assigned_to = agentId;
  this.distributionData.assignedBy = assignmentType;
  this.distributionData.assignmentDate = new Date();
  this.distributionData.autoAssigned = assignmentType !== "manual";
  return this.save();
};

LeadSchema.methods.addNote = async function (noteData, userId) {
  this.notes.push({
    note_desc: noteData.note_desc,
    addedBy: userId,
    createdTime: new Date(),
  });
  return this.save();
};

module.exports = mongoose.model("Lead", LeadSchema);