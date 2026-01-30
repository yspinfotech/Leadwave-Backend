const mongoose = require("mongoose");

const CallLogSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    callTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    callStatus: {
      type: String,
      trim: true,
      // examples: connected, missed, voicemail
    },
    callType: {
      type: String,
      enum: ["incoming", "outgoing"],
    },
    recordingLink: {
      type: String,
      trim: true,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: { createdAt: "created", updatedAt: "updated" },
    versionKey: false,
  },
);

module.exports = mongoose.model("CallLog", CallLogSchema);
