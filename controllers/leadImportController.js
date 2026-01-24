const Lead = require("../models/Lead");
const XLSX = require("xlsx");
const csvParser = require("csv-parser");
const fs = require("fs");
const { LEAD_SOURCE, LEAD_STATUS } = require("../config/leadEnums");

/**
 * @route   POST /api/leads/import
 * @desc    Admin imports leads via CSV or XLSX
 * @access  Admin only
 */
exports.importLeads = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required",
      });
    }

    const filePath = req.file.path;
    const ext = req.file.originalname.split(".").pop().toLowerCase();

    let leads = [];

    /* =====================
       READ FILE
    ===================== */
    if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      leads = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else if (ext === "csv") {
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csvParser())
          .on("data", (row) => leads.push(row))
          .on("end", resolve)
          .on("error", reject);
      });
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: "Invalid file format. Use CSV or XLSX",
      });
    }

    /* =====================
       PROCESS LEADS
    ===================== */
    let inserted = 0;
    let skipped = 0;
    let errors = [];

    for (const row of leads) {
      const firstName = row.firstName || row.firstname;
      const lastName = row.lastName || row.lastname;
      const phone = row.phone;
      const email = row.email || null;
      const alt_phone = row.alt_phone || null;

      // Required validation
      if (!firstName || !lastName || !phone) {
        skipped++;
        errors.push({
          row,
          reason: "Missing required fields",
        });
        continue;
      }

      // Duplicate check (company + phone)
      const exists = await Lead.findOne({
        companyId: req.user.companyId,
        phone,
        isDeleted: false,
      });

      if (exists) {
        skipped++;
        continue;
      }

      await Lead.create({
        firstName,
        lastName,
        email,
        phone,
        alt_phone,

        leadSource: LEAD_SOURCE.FILE,
        leadStatus: LEAD_STATUS.NEW,

        companyId: req.user.companyId,
      });

      inserted++;
    }

    fs.unlinkSync(filePath); // cleanup

    res.status(200).json({
      success: true,
      message: "Lead import completed",
      summary: {
        total: leads.length,
        inserted,
        skipped,
        errorsCount: errors.length,
      },
      errors,
    });
  } catch (error) {
    console.error("Import Leads Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
