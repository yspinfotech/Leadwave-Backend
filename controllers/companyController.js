const Company = require("../models/Company");

/**
 * @route   POST /api/companies
 * @desc    Create a new company
 * @access  SuperAdmin only
 */
exports.createCompany = async (req, res) => {
  try {
    const { name, location } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Company name is required",
      });
    }

    const companyExists = await Company.findOne({ name });

    if (companyExists) {
      return res.status(409).json({
        success: false,
        message: "Company already exists",
      });
    }

    const company = await Company.create({
      name,
      location,
    });

    res.status(201).json({
      success: true,
      data: company,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
