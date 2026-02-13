// models/Lead.js - Add campaign field
const mongoose = require("mongoose");
const { LEAD_SOURCE, LEAD_STATUS } = require("../config/leadEnums");

const NoteSchema = new mongoose.Schema(
  {
     callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CallLog",
      required: true,
    },
    
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
    },
    tag: {
      type: String,
    },
    platform: {
      type: String,
    },
    activity: {
      type: String,
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
      default: null,
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

// Indexes
LeadSchema.index({ phone: 1, companyId: 1 }, { unique: true });
LeadSchema.index({ campaign: 1, leadStatus: 1 });
LeadSchema.index({ campaign: 1, assigned_to: 1 });
LeadSchema.index({ companyId: 1, isDeleted: 1 });

// Virtuals
LeadSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model("Lead", LeadSchema);