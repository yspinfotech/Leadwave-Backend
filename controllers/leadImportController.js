const Lead = require("../models/Lead");
const Campaign = require("../models/Campaign");
const XLSX = require("xlsx");
const fs = require("fs");

/**
 * @route   POST /api/leads/import
 * @desc    Fast bulk import leads
 * @access  Admin only
 */
exports.importLeads = async (req, res) => {
  console.time('TotalImportTime');
  
  try {
    console.log("=== Fast Bulk Import Started ===");
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required",
      });
    }

    const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {};
    const campaignId = req.body.campaign || mapping.campaign;
    
    console.log("Mapping received:", mapping);
    console.log("Campaign ID:", campaignId);

    // Validate campaign if provided
    let campaign = null;
    if (campaignId) {
      campaign = await Campaign.findOne({
        _id: campaignId,
        companyId: req.user.companyId,
        status: { $in: ['active', 'draft'] }
      }).lean();
      
      if (!campaign) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: "Invalid campaign selected",
        });
      }
      console.log("Campaign found:", campaign.name);
    }

    const filePath = req.file.path;
    const ext = req.file.originalname.split(".").pop().toLowerCase();

    let leads = [];

    /* =====================
       READ FILE FAST
    ===================== */
    console.time('FileReading');
    if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      leads = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else if (ext === "csv") {
      // Fast CSV reading
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] ? values[index].trim() : '';
        });
        leads.push(row);
      }
    }
    console.timeEnd('FileReading');
    
    console.log(`Total rows: ${leads.length}`);
    if (leads.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: "No data found in file",
      });
    }

    /* =====================
       PREPARE DATA
       ===================== */
    const DEFAULT_LEAD_SOURCE = 'Other';
    const DEFAULT_LEAD_STATUS = 'new';
    
    // Get existing phone numbers in bulk
    console.time('FetchExistingPhones');
    const existingPhones = await Lead.find({
      companyId: req.user.companyId,
      isDeleted: false
    }).select('phone').lean();
    const existingPhoneSet = new Set(existingPhones.map(l => l.phone));
    console.timeEnd('FetchExistingPhones');

    // Process leads in memory
    console.time('DataProcessing');
    const leadsToInsert = [];
    const phonesToUpdate = new Set();
    const errors = [];
    
    // Helper function
    const getValue = (row, field) => {
      if (mapping[field]) return row[mapping[field]] || '';
      if (mapping[`${field}_csv`]) return row[mapping[`${field}_csv`]] || '';
      if (mapping[`${field}`] && mapping[`${field}`] !== 'csv_column') return mapping[`${field}`];
      return row[field] || '';
    };

    for (let i = 0; i < leads.length; i++) {
      try {
        const row = leads[i];
        
        // Get values
        const firstName = getValue(row, 'firstName') || row.firstName || row.firstname || row['First Name'] || '';
        const lastName = getValue(row, 'lastName') || row.lastName || row.lastname || row['Last Name'] || '';
        let phone = getValue(row, 'phone') || row.phone || row.Phone || row['Phone Number'] || '';
        
        // Clean and validate phone
        phone = phone.toString().replace(/\D/g, '').trim();
        
        if (!firstName || !lastName || !phone || phone.length < 10) {
          errors.push({ row: i + 1, reason: "Invalid or missing data" });
          continue;
        }
        
        // Check if phone already exists
        if (existingPhoneSet.has(phone)) {
          phonesToUpdate.add(phone);
          continue;
        }
        
        // Prepare lead for insertion
        const email = getValue(row, 'email') || row.email || row.Email || '';
        const leadSource = getValue(row, 'leadSource') || row.leadSource || row['Lead Source'] || DEFAULT_LEAD_SOURCE;
        
        const leadData = {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone,
          email: email ? email.trim().toLowerCase() : null,
          alt_phone: getValue(row, 'alt_phone') || row.alt_phone || row.altPhone || '',
          leadSource: leadSource,
          tag: getValue(row, 'tag') || row.tag || row.Tag || '',
          platform: getValue(row, 'platform') || row.platform || row.Platform || '',
          activity: getValue(row, 'activity') || row.activity || row.Activity || '',
          campaign: campaignId || null,
          leadStatus: DEFAULT_LEAD_STATUS,
          companyId: req.user.companyId,
          star: 1,
          isDeleted: false
        };
        
        // Validate email
        if (leadData.email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(leadData.email)) {
            leadData.email = null;
          }
        }
        
        leadsToInsert.push(leadData);
        existingPhoneSet.add(phone); // Add to set to avoid duplicates in same batch
        
      } catch (error) {
        errors.push({ row: i + 1, reason: error.message });
      }
    }
    console.timeEnd('DataProcessing');

    /* =====================
       BULK OPERATIONS
       ===================== */
    console.time('DatabaseOperations');
    let inserted = 0;
    let updated = 0;
    
    // Bulk insert new leads
    if (leadsToInsert.length > 0) {
      try {
        // Use insertMany with ordered: false for better performance
        const result = await Lead.insertMany(leadsToInsert, { ordered: false });
        inserted = result.length;
        console.log(`Inserted ${inserted} new leads`);
      } catch (insertError) {
        console.error("Bulk insert error:", insertError);
        // Insert individually if bulk fails
        for (const leadData of leadsToInsert) {
          try {
            await Lead.create(leadData);
            inserted++;
          } catch (err) {
            errors.push({ row: 'unknown', reason: `Insert failed: ${err.message}` });
          }
        }
      }
    }
    
    // Bulk update existing leads (increment star)
    if (phonesToUpdate.size > 0) {
      const updateResult = await Lead.updateMany(
        {
          companyId: req.user.companyId,
          phone: { $in: Array.from(phonesToUpdate) },
          isDeleted: false
        },
        { $inc: { star: 1 } }
      );
      updated = updateResult.modifiedCount;
      console.log(`Updated ${updated} existing leads`);
    }
    console.timeEnd('DatabaseOperations');

    // Update campaign stats
    if (campaign && inserted > 0) {
      await Campaign.updateOne(
        { _id: campaignId },
        { $inc: { 'stats.totalLeads': inserted } }
      );
    }

    // Cleanup
    fs.unlinkSync(filePath);
    
    console.timeEnd('TotalImportTime');
    console.log("=== Import Summary ===");
    console.log(`Total rows: ${leads.length}`);
    console.log(`Inserted: ${inserted}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors: ${errors.length}`);

    res.status(200).json({
      success: true,
      message: "Bulk import completed",
      summary: {
        total: leads.length,
        inserted,
        updated,
        skipped: errors.length,
        errorsCount: errors.length
      },
      errors: errors.slice(0, 50), // Limit errors in response
      campaign: campaign ? { id: campaign._id, name: campaign.name } : null
    });

  } catch (error) {
    console.error("Import Error:", error);
    
    // Cleanup on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: "Import failed. Please try with smaller file or check file format.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};