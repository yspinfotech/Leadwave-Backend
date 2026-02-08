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

module.exports = mongoose.model("Lead", LeadSchema);
