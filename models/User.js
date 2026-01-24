const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const ROLES = require("../config/roles");

const UserSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: function () {
        return this.role !== ROLES.SUPERADMIN;
      },
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    mobile: String,
    city: String,

    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdTime: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false },
);

/**
 * 🔐 Hash password before saving
 * IMPORTANT: async hook → DO NOT use next()
 */
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * 🔑 Compare passwords
 */
UserSchema.methods.comparePassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
