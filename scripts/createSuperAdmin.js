/**
 * Run this ONCE to create SuperAdmin
 * node scripts/createSuperAdmin.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/User");
const ROLES = require("../config/roles");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    const superAdminEmail = "superadmin@leadwave.com";

    const exists = await User.findOne({ email: superAdminEmail });
    if (exists) {
      console.log("❌ SuperAdmin already exists");
      process.exit(0);
    }

    await User.create({
      name: "LeadWave SuperAdmin",
      email: superAdminEmail,
      password: "SuperAdmin@123", // change after first login
      role: ROLES.SUPERADMIN,
    });

    console.log("✅ SuperAdmin created successfully");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
