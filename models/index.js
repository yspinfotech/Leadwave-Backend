// models/index.js
const mongoose = require("mongoose");

// Import all models
const User = require("./User");
const Lead = require("./Lead");
const Campaign = require("./Campaign");

// Export all models
module.exports = {
  User,
  Lead,
  Campaign,
  mongoose
};