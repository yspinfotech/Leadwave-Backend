const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema(
  {
    company_no: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    company_email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^\S+@\S+\.\S+$/, "Please fill a valid email address"],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdOn: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

module.exports = mongoose.model("Company", CompanySchema);
