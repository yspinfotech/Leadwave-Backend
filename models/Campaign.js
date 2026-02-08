// models/Campaign.js
const mongoose = require("mongoose");

const CampaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Campaign name is required"],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    // Reference to User model (Campaign Manager)
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Campaign manager is required"],
    },

    // Default pipeline type
    pipeline: {
      type: String,
      enum: ["course", "service", "product", "custom"],
      default: "course",
    },

    // Array of agents (salespersons/marketing) assigned to this campaign
    agents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      // REMOVED: required: true - Allow empty array
    }],

    // Lead distribution strategy
    leadDistribution: {
      type: String,
      enum: ["ondemand", "equal", "conditional"],
      default: "ondemand",
    },

    // Campaign priority
    priority: {
      type: String,
      enum: ["highest", "high", "medium", "low", "lowest"],
      default: "medium",
    },

    // Campaign status
    status: {
      type: String,
      enum: ["draft", "active", "paused", "completed"],
      default: "draft",
    },

    // Statistics
    stats: {
      totalLeads: {
        type: Number,
        default: 0,
      },
      assignedLeads: {
        type: Number,
        default: 0,
      },
      convertedLeads: {
        type: Number,
        default: 0,
      },
      revenue: {
        type: Number,
        default: 0,
      },
    },

    // Configuration for conditional lead distribution
    distributionRules: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Add companyId for multi-tenant support
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    // Add createdBy to track who created the campaign
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Timestamps
    created: {
      type: Date,
      default: Date.now,
    },
    updated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created", updatedAt: "updated" },
  }
);

// Indexes for better query performance
CampaignSchema.index({ manager: 1, status: 1 });
CampaignSchema.index({ agents: 1 });
CampaignSchema.index({ priority: 1 });
CampaignSchema.index({ status: 1 });
CampaignSchema.index({ companyId: 1 });

// FIXED Middleware: Remove the 'next' parameter
CampaignSchema.pre("save", function() {
  this.updated = Date.now();
  // No need to call next() - Mongoose handles it automatically
});

module.exports = mongoose.model("Campaign", CampaignSchema);