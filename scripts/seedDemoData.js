const mongoose = require("mongoose");
require("dotenv").config();

const Company = require("../models/Company");
const User = require("../models/User");
const Lead = require("../models/Lead");
const ROLES = require("../config/roles");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    // Use provided company id (via env COMPANY_ID) or fallback to requested id
    const TARGET_COMPANY_ID =
      process.env.COMPANY_ID || "6975f071821238f672466d2f";

    const company = await Company.findById(TARGET_COMPANY_ID);
    if (!company) {
      console.error(
        `Company with id ${TARGET_COMPANY_ID} not found. Aborting.`,
      );
      process.exit(1);
    }
    console.log("Using Company:", company._id.toString());

    // Do NOT create company or admin — create leads only for the given company

    // Create 20 demo leads for the company
    const desiredTotal = 20;
    const existingLeads = await Lead.countDocuments({ companyId: company._id });
    if (existingLeads >= desiredTotal) {
      console.log(`Demo leads already exist (>=${desiredTotal})`);
    } else {
      const toCreate = desiredTotal - existingLeads;
      const leadsToCreate = [];
      const baseSuffix = Date.now().toString().slice(-6);
      for (let i = 1; i <= toCreate; i++) {
        const idx = existingLeads + i;
        const phone = `+1555${baseSuffix}${String(idx).padStart(3, "0")}`;
        leadsToCreate.push({
          firstName: `Lead${idx}`,
          lastName: `Demo${idx}`,
          email: `lead${idx}@example.com`,
          phone,
          alt_phone: null,
          leadSource: "FILE",
          leadStatus: "NEW",
          companyId: company._id,
          assigned_to: null,
          assigned_by: null,
          isDeleted: false,
        });
      }

      console.log(`Prepared ${leadsToCreate.length} lead documents to insert`);
      console.log("Sample payload:", leadsToCreate[0]);

      try {
        // Use the underlying collection driver for a clearer raw result
        const raw = await Lead.collection.insertMany(leadsToCreate, {
          ordered: false,
        });
        console.log("Raw insert result:", raw && raw.result ? raw.result : raw);
        const insertedCount =
          (raw && raw.insertedCount) ||
          (raw && raw.result && raw.result.n) ||
          0;
        console.log(`Inserted count (driver): ${insertedCount}`);
      } catch (insertErr) {
        console.error(
          "InsertMany driver error:",
          insertErr && insertErr.writeErrors
            ? insertErr.writeErrors
            : insertErr,
        );

        // Try inserting a single document to get a clear validation/driver error
        try {
          console.log(
            "Attempting single-document insert to capture validation errors...",
          );
          const single = await Lead.create(leadsToCreate[0]);
          console.log("Single insert succeeded:", single._id.toString());
        } catch (singleErr) {
          console.error("Single insert error:", singleErr);
        }
      }
    }

    // Diagnostic: fetch total and sample leads to confirm insertion
    try {
      const finalCount = await Lead.countDocuments({ companyId: company._id });
      console.log(`Final lead count for company ${company._id}:`, finalCount);
      const sample = await Lead.find({ companyId: company._id })
        .sort({ created: -1 })
        .limit(5)
        .select("firstName lastName phone created");
      console.log(
        "Sample leads:",
        sample.map((s) => ({
          id: s._id.toString(),
          firstName: s.firstName,
          phone: s.phone,
          created: s.created,
        })),
      );
    } catch (qErr) {
      console.error("Diagnostic query error:", qErr);
    }

    console.log("--- Demo leads created for company ---");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
