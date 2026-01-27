const Company = require("../models/Company");

/**
 * @route   POST /api/companies
 * @desc    Create a new company
 * @access  SuperAdmin only
 */
exports.createCompany = async (req, res) => {
  try {
    const { name, location, company_no, company_email } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Company name is required",
      });
    }

    if (!company_no) {
      return res.status(400).json({
        success: false,
        message: "Company number is required",
      });
    }

    if (!company_email) {
      return res.status(400).json({
        success: false,
        message: "Company email is required",
      });
    }

    const companyExists = await Company.findOne({
      $or: [{ name }, { company_no }, { company_email }],
    });

    if (companyExists) {
      const conflicts = [];
      if (companyExists.name === name) conflicts.push("name");
      if (companyExists.company_no === company_no) conflicts.push("company_no");
      if (companyExists.company_email === company_email)
        conflicts.push("company_email");

      const readable = conflicts
        .map((c) => {
          if (c === "company_no") return "company number";
          if (c === "company_email") return "company email";
          return "name";
        })
        .join(" and ");

      return res.status(409).json({
        success: false,
        message: `Company with the same ${readable} already exists`,
      });
    }

    const company = await Company.create({
      name,
      location,
      company_no,
      company_email,
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

/**
 * @route   GET /api/companies
 * @desc    Get paginated list of companies
 * @access  SuperAdmin only
 */
exports.getCompanies = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const total = await Company.countDocuments();
    const pages = Math.ceil(total / limit);

    const companies = await Company.find()
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      data: companies,
      pagination: { total, page, pages, limit },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
