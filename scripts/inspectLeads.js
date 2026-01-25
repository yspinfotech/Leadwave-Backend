/**
 * Inspect Lead documents to diagnose companyId storage
 * Usage: node scripts/inspectLeads.js
 * Requires: MONGO_URI in .env
 */

const mongoose = require("mongoose");
require("dotenv").config();

const Lead = require("../models/Lead");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    const total = await Lead.countDocuments();
    const notDeleted = await Lead.countDocuments({ isDeleted: false });
    console.log(`Total leads: ${total}`);
    console.log(`Leads with isDeleted:false: ${notDeleted}`);

    const distinctCompanyIds = await Lead.distinct("companyId");
    console.log(
      "Distinct companyId values (up to 50):",
      distinctCompanyIds.slice(0, 50),
    );

    const samples = await Lead.find().limit(10).lean();
    console.log(
      `Sample ${samples.length} lead docs (showing id, companyId type/value, isDeleted, created):`,
    );
    samples.forEach((s, i) => {
      console.log(i + 1, {
        _id: String(s._id),
        companyId_type:
          s.companyId === undefined ? "undefined" : typeof s.companyId,
        companyId_value: s.companyId,
        isDeleted: s.isDeleted,
        created: s.created || s.createdAt || null,
      });
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Inspect error:", err);
    process.exit(1);
  }
})();
