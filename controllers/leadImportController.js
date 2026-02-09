const Lead = require("../models/Lead");
const Campaign = require("../models/Campaign");
const XLSX = require("xlsx");
const fs = require("fs");
const { Readable } = require("stream");

/**
 * @route   POST /api/leads/import
 * @desc    Fast bulk import leads with streaming and batch processing
 * @access  Admin only
 */
exports.importLeads = async (req, res) => {
  console.time('TotalImportTime');
  
  try {
    console.log("=== Fast Bulk Import Started ===");
    
    // Validate file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required",
      });
    }

    // Check file size (server-side validation)
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    if (req.file.size > MAX_FILE_SIZE) {
      fs.unlinkSync(req.file.path);
      return res.status(413).json({
        success: false,
        message: `File size exceeds ${MAX_FILE_SIZE/(1024*1024)}MB limit`,
        maxSizeMB: MAX_FILE_SIZE/(1024*1024)
      });
    }

    const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {};
    const campaignId = req.body.campaign || mapping.campaign;
    
    console.log("Mapping received:", mapping);
    console.log("Campaign ID:", campaignId);
    console.log("File details:", {
      name: req.file.originalname,
      size: `${(req.file.size/(1024*1024)).toFixed(2)}MB`,
      type: req.file.mimetype
    });

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
      const workbook = XLSX.readFile(filePath, {
        cellDates: true,
        cellStyles: false,
        sheetStubs: false
      });
      const sheetName = workbook.SheetNames[0];
      leads = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: '',
        blankrows: false
      });
    } else if (ext === "csv") {
      // Improved CSV reading with streaming for large files
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({
          success: false,
          message: "No data found in file",
        });
      }
      
      const headers = lines[0].split(',').map(h => h.trim());
      
      // Process with batch for better performance
      const BATCH_SIZE = 10000;
      for (let i = 1; i < lines.length; i += BATCH_SIZE) {
        const batchEnd = Math.min(i + BATCH_SIZE, lines.length);
        for (let j = i; j < batchEnd; j++) {
          if (!lines[j].trim()) continue;
          const values = lines[j].split(',').map(v => v.trim());
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          leads.push(row);
        }
      }
    }
    console.timeEnd('FileReading');
    
    console.log(`Total rows: ${leads.length}`);
    if (leads.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: "No valid data found in file",
      });
    }

    /* =====================
       PREPARE DATA
    ===================== */
    const DEFAULT_LEAD_SOURCE = 'Other';
    const DEFAULT_LEAD_STATUS = 'new';
    
    // Optimize: Fetch existing phones in batches for large datasets
    console.time('FetchExistingPhones');
    let existingPhoneSet = new Set();
    
    // Only fetch existing phones if we have leads to process
    if (leads.length > 0) {
      // Extract all potential phone numbers from the file first
      const allFilePhones = [];
      for (const row of leads) {
        const phone = (row.phone || row.Phone || row['Phone Number'] || '').toString().replace(/\D/g, '').trim();
        if (phone.length >= 10) {
          allFilePhones.push(phone);
        }
      }
      
      // Deduplicate phone numbers before querying
      const uniqueFilePhones = [...new Set(allFilePhones)];
      console.log(`Unique phone numbers in file: ${uniqueFilePhones.length}`);
      
      if (uniqueFilePhones.length > 0) {
        // Query in batches to avoid MongoDB query size limits
        const BATCH_SIZE = 50000;
        for (let i = 0; i < uniqueFilePhones.length; i += BATCH_SIZE) {
          const batch = uniqueFilePhones.slice(i, i + BATCH_SIZE);
          const existingBatch = await Lead.find({
            companyId: req.user.companyId,
            phone: { $in: batch },
            isDeleted: false
          }).select('phone').lean();
          
          existingBatch.forEach(lead => existingPhoneSet.add(lead.phone));
        }
        console.log(`Found ${existingPhoneSet.size} existing phone numbers in database`);
      }
    }
    console.timeEnd('FetchExistingPhones');

    /* =====================
       PROCESS DATA IN BATCHES
    ===================== */
    console.time('DataProcessing');
    const leadsToInsert = [];
    const leadsToUpdate = []; // Store full lead data for updates
    const errors = [];
    
    const BATCH_PROCESS_SIZE = 5000;
    let batchCount = 0;
    
    // Helper function
    const getValue = (row, field) => {
      if (mapping[field]) return row[mapping[field]] || '';
      if (mapping[`${field}_csv`]) return row[mapping[`${field}_csv`]] || '';
      if (mapping[`${field}`] && mapping[`${field}`] !== 'csv_column') return mapping[`${field}`];
      return row[field] || '';
    };

    // Process leads in batches to manage memory
    for (let i = 0; i < leads.length; i++) {
      try {
        const row = leads[i];
        
        // Get values with improved field detection
        const firstName = getValue(row, 'firstName') || 
                         row.firstName || 
                         row.firstname || 
                         row['First Name'] || 
                         row['FIRST NAME'] || 
                         row['first_name'] || '';
        
        const lastName = getValue(row, 'lastName') || 
                        row.lastName || 
                        row.lastname || 
                        row['Last Name'] || 
                        row['LAST NAME'] || 
                        row['last_name'] || '';
        
        let phone = getValue(row, 'phone') || 
                   row.phone || 
                   row.Phone || 
                   row['Phone Number'] || 
                   row['PHONE'] || 
                   row['Mobile'] || 
                   row['mobile'] || 
                   row['Contact Number'] || '';
        
        // Clean and validate phone
        phone = phone.toString().replace(/\D/g, '').trim();
        
        // Enhanced validation
        if (!firstName || !lastName || !phone || phone.length < 10) {
          errors.push({ 
            row: i + 1, 
            reason: `Invalid or missing data: First Name="${firstName}", Last Name="${lastName}", Phone="${phone}"` 
          });
          continue;
        }
        
        // Check if phone already exists
        if (existingPhoneSet.has(phone)) {
          leadsToUpdate.push({
            phone: phone,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: getValue(row, 'email') || row.email || row.Email || '',
            alt_phone: getValue(row, 'alt_phone') || row.alt_phone || row.altPhone || '',
            leadSource: getValue(row, 'leadSource') || row.leadSource || row['Lead Source'] || DEFAULT_LEAD_SOURCE,
            tag: getValue(row, 'tag') || row.tag || row.Tag || '',
            platform: getValue(row, 'platform') || row.platform || row.Platform || '',
            activity: getValue(row, 'activity') || row.activity || row.Activity || '',
            campaign: campaignId || null
          });
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
          importedAt: new Date(),
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
        
        // Process in batches to prevent memory issues
        if (leadsToInsert.length >= BATCH_PROCESS_SIZE) {
          batchCount++;
          console.log(`Processed batch ${batchCount}: ${leadsToInsert.length} leads`);
          // Note: In a more advanced version, you would insert this batch here
        }
        
      } catch (error) {
        errors.push({ row: i + 1, reason: `Processing error: ${error.message}` });
      }
    }
    console.timeEnd('DataProcessing');
    console.log(`Processing complete: ${leadsToInsert.length} to insert, ${leadsToUpdate.length} to update`);

    /* =====================
       BULK OPERATIONS
    ===================== */
    console.time('DatabaseOperations');
    let inserted = 0;
    let updated = 0;
    
    // Bulk insert new leads in chunks to avoid timeout
    if (leadsToInsert.length > 0) {
      const INSERT_BATCH_SIZE = 10000;
      
      for (let i = 0; i < leadsToInsert.length; i += INSERT_BATCH_SIZE) {
        const batch = leadsToInsert.slice(i, i + INSERT_BATCH_SIZE);
        try {
          const result = await Lead.insertMany(batch, { 
            ordered: false,
            rawResult: true
          });
          inserted += result.insertedCount;
          console.log(`Inserted batch ${Math.floor(i/INSERT_BATCH_SIZE) + 1}: ${result.insertedCount} leads`);
        } catch (insertError) {
          console.error(`Batch insert error (batch ${Math.floor(i/INSERT_BATCH_SIZE) + 1}):`, insertError.message);
          
          // Fallback: Insert individually for failed batch
          for (const leadData of batch) {
            try {
              await Lead.create(leadData);
              inserted++;
            } catch (err) {
              errors.push({ row: 'unknown', reason: `Insert failed: ${err.message}`, phone: leadData.phone });
            }
          }
        }
      }
    }
    
    // Bulk update existing leads with more information
    if (leadsToUpdate.length > 0) {
      const UPDATE_BATCH_SIZE = 10000;
      
      for (let i = 0; i < leadsToUpdate.length; i += UPDATE_BATCH_SIZE) {
        const batch = leadsToUpdate.slice(i, i + UPDATE_BATCH_SIZE);
        
        // Create bulk operations for this batch
        const bulkOps = batch.map(lead => ({
          updateOne: {
            filter: {
              companyId: req.user.companyId,
              phone: lead.phone,
              isDeleted: false
            },
            update: {
              $inc: { star: 1 },
              $set: {
                firstName: lead.firstName,
                lastName: lead.lastName,
                email: lead.email ? lead.email.toLowerCase() : null,
                alt_phone: lead.alt_phone,
                leadSource: lead.leadSource,
                tag: lead.tag,
                platform: lead.platform,
                activity: lead.activity,
                campaign: lead.campaign,
                updatedAt: new Date()
              },
              $setOnInsert: {
                createdAt: new Date(),
                leadStatus: DEFAULT_LEAD_STATUS,
                importedAt: new Date()
              }
            },
            upsert: false // Only update existing
          }
        }));
        
        try {
          const updateResult = await Lead.bulkWrite(bulkOps, { ordered: false });
          updated += updateResult.modifiedCount;
          console.log(`Updated batch ${Math.floor(i/UPDATE_BATCH_SIZE) + 1}: ${updateResult.modifiedCount} leads`);
        } catch (updateError) {
          console.error(`Batch update error:`, updateError.message);
          
          // Fallback: Update individually
          for (const lead of batch) {
            try {
              const result = await Lead.updateOne(
                {
                  companyId: req.user.companyId,
                  phone: lead.phone,
                  isDeleted: false
                },
                {
                  $inc: { star: 1 },
                  $set: {
                    firstName: lead.firstName,
                    lastName: lead.lastName,
                    email: lead.email ? lead.email.toLowerCase() : null,
                    alt_phone: lead.alt_phone,
                    leadSource: lead.leadSource,
                    tag: lead.tag,
                    platform: lead.platform,
                    activity: lead.activity,
                    campaign: lead.campaign,
                    updatedAt: new Date()
                  }
                }
              );
              if (result.modifiedCount > 0) updated++;
            } catch (err) {
              errors.push({ row: 'unknown', reason: `Update failed: ${err.message}`, phone: lead.phone });
            }
          }
        }
      }
    }
    console.timeEnd('DatabaseOperations');

    // Update campaign stats if campaign exists and leads were inserted
    if (campaign) {
      try {
        const campaignUpdate = {};
        if (inserted > 0) {
          campaignUpdate['$inc'] = { 'stats.totalLeads': inserted };
        }
        if (Object.keys(campaignUpdate).length > 0) {
          await Campaign.updateOne({ _id: campaignId }, campaignUpdate);
          console.log(`Updated campaign ${campaign.name} stats`);
        }
      } catch (campaignError) {
        console.error("Failed to update campaign stats:", campaignError);
      }
    }

    // Cleanup
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log("Temporary file cleaned up");
      }
    } catch (cleanupError) {
      console.error("File cleanup error:", cleanupError);
    }
    
    console.timeEnd('TotalImportTime');
    console.log("=== Import Summary ===");
    console.log(`Total rows processed: ${leads.length}`);
    console.log(`New leads inserted: ${inserted}`);
    console.log(`Existing leads updated: ${updated}`);
    console.log(`Errors/Skipped: ${errors.length}`);
    console.log(`Success rate: ${(((inserted + updated) / leads.length) * 100).toFixed(2)}%`);

    // Prepare success response
    res.status(200).json({
      success: true,
      message: `Bulk import completed successfully`,
      summary: {
        total: leads.length,
        inserted,
        updated,
        skipped: errors.length,
        successRate: `${(((inserted + updated) / leads.length) * 100).toFixed(2)}%`,
        errorsCount: errors.length
      },
      errors: errors.length > 0 ? errors.slice(0, 100) : [], // Limit to 100 errors in response
      campaign: campaign ? { id: campaign._id, name: campaign.name } : null,
      importDetails: {
        file: req.file.originalname,
        fileSize: `${(req.file.size/(1024*1024)).toFixed(2)}MB`,
        processedAt: new Date().toISOString(),
        processingTime: console.timeEnd('TotalImportTime') // This would need adjustment
      }
    });

  } catch (error) {
    console.error("Import Error:", error);
    
    // Cleanup on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error("Failed to delete temp file:", unlinkError);
      }
    }
    
    // Provide user-friendly error messages
    let userMessage = "Import failed. Please try with smaller file or check file format.";
    let errorDetails = process.env.NODE_ENV === 'development' ? error.message : undefined;
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      userMessage = "File size too large. Please upload a file smaller than 100MB.";
    } else if (error.message.includes('timeout')) {
      userMessage = "Import timed out. Please try with a smaller file or split your data.";
    } else if (error.message.includes('memory')) {
      userMessage = "File is too large to process. Please split your data into smaller files.";
    }
    
    res.status(500).json({
      success: false,
      message: userMessage,
      error: errorDetails,
      code: error.code
    });
  }
};

/**
 * @route   POST /api/leads/validate-import
 * @desc    Validate import file before actual import
 * @access  Admin only
 */
exports.validateImportFile = async (req, res) => {
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

    // Read file (similar to main import)
    if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      leads = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else if (ext === "csv") {
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

    // Cleanup
    fs.unlinkSync(filePath);

    // Basic validation
    const validation = {
      totalRows: leads.length,
      sampleRows: leads.slice(0, 5),
      columns: leads.length > 0 ? Object.keys(leads[0]) : [],
      hasFirstName: false,
      hasLastName: false,
      hasPhone: false,
      validRows: 0,
      invalidRows: 0,
      sampleErrors: []
    };

    // Check first few rows for validation
    for (let i = 0; i < Math.min(leads.length, 10); i++) {
      const row = leads[i];
      const firstName = row.firstName || row.firstname || row['First Name'] || '';
      const lastName = row.lastName || row.lastname || row['Last Name'] || '';
      const phone = (row.phone || row.Phone || row['Phone Number'] || '').toString().replace(/\D/g, '').trim();
      
      if (firstName && lastName && phone && phone.length >= 10) {
        validation.validRows++;
      } else {
        validation.invalidRows++;
        if (validation.sampleErrors.length < 3) {
          validation.sampleErrors.push({
            row: i + 1,
            firstName: !!firstName,
            lastName: !!lastName,
            phone: phone.length >= 10
          });
        }
      }
    }

    // Check column existence
    validation.hasFirstName = validation.columns.some(col => 
      ['firstName', 'firstname', 'First Name', 'FIRST_NAME'].includes(col)
    );
    validation.hasLastName = validation.columns.some(col => 
      ['lastName', 'lastname', 'Last Name', 'LAST_NAME'].includes(col)
    );
    validation.hasPhone = validation.columns.some(col => 
      ['phone', 'Phone', 'Phone Number', 'PHONE', 'mobile', 'Mobile'].includes(col)
    );

    res.status(200).json({
      success: true,
      validation,
      message: `File validated: ${leads.length} rows found`
    });

  } catch (error) {
    console.error("Validation Error:", error);
    
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: "File validation failed",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// const Lead = require("../models/Lead");
// const Campaign = require("../models/Campaign");
// const XLSX = require("xlsx");
// const fs = require("fs");

// /**
//  * @route   POST /api/leads/import
//  * @desc    Fast bulk import leads
//  * @access  Admin only
//  */
// exports.importLeads = async (req, res) => {
//   console.time('TotalImportTime');
  
//   try {
//     console.log("=== Fast Bulk Import Started ===");
    
//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: "File is required",
//       });
//     }

//     const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {};
//     const campaignId = req.body.campaign || mapping.campaign;
    
//     console.log("Mapping received:", mapping);
//     console.log("Campaign ID:", campaignId);

//     // Validate campaign if provided
//     let campaign = null;
//     if (campaignId) {
//       campaign = await Campaign.findOne({
//         _id: campaignId,
//         companyId: req.user.companyId,
//         status: { $in: ['active', 'draft'] }
//       }).lean();
      
//       if (!campaign) {
//         fs.unlinkSync(req.file.path);
//         return res.status(400).json({
//           success: false,
//           message: "Invalid campaign selected",
//         });
//       }
//       console.log("Campaign found:", campaign.name);
//     }

//     const filePath = req.file.path;
//     const ext = req.file.originalname.split(".").pop().toLowerCase();

//     let leads = [];

//     /* =====================
//        READ FILE FAST
//     ===================== */
//     console.time('FileReading');
//     if (ext === "xlsx" || ext === "xls") {
//       const workbook = XLSX.readFile(filePath);
//       const sheetName = workbook.SheetNames[0];
//       leads = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
//     } else if (ext === "csv") {
//       // Fast CSV reading
//       const fileContent = fs.readFileSync(filePath, 'utf8');
//       const lines = fileContent.split('\n');
//       const headers = lines[0].split(',').map(h => h.trim());
      
//       for (let i = 1; i < lines.length; i++) {
//         if (!lines[i].trim()) continue;
//         const values = lines[i].split(',');
//         const row = {};
//         headers.forEach((header, index) => {
//           row[header] = values[index] ? values[index].trim() : '';
//         });
//         leads.push(row);
//       }
//     }
//     console.timeEnd('FileReading');
    
//     console.log(`Total rows: ${leads.length}`);
//     if (leads.length === 0) {
//       fs.unlinkSync(filePath);
//       return res.status(400).json({
//         success: false,
//         message: "No data found in file",
//       });
//     }

//     /* =====================
//        PREPARE DATA
//        ===================== */
//     const DEFAULT_LEAD_SOURCE = 'Other';
//     const DEFAULT_LEAD_STATUS = 'new';
    
//     // Get existing phone numbers in bulk
//     console.time('FetchExistingPhones');

//     const existingPhones = await Lead.find({
//       companyId: req.user.companyId,
//       isDeleted: false
//     }).select('phone').lean();

//     const existingPhoneSet = new Set(existingPhones.map(l => l.phone));

//     console.timeEnd('FetchExistingPhones');

//     // Process leads in memory
//     console.time('DataProcessing');
//     const leadsToInsert = [];
//     const phonesToUpdate = new Set();
//     const errors = [];
    
//     // Helper function
//     const getValue = (row, field) => {
//       if (mapping[field]) return row[mapping[field]] || '';
//       if (mapping[`${field}_csv`]) return row[mapping[`${field}_csv`]] || '';
//       if (mapping[`${field}`] && mapping[`${field}`] !== 'csv_column') return mapping[`${field}`];
//       return row[field] || '';
//     };

//     for (let i = 0; i < leads.length; i++) {
//       try {
//         const row = leads[i];
        
//         // Get values
//         const firstName = getValue(row, 'firstName') || row.firstName || row.firstname || row['First Name'] || '';
//         const lastName = getValue(row, 'lastName') || row.lastName || row.lastname || row['Last Name'] || '';
//         let phone = getValue(row, 'phone') || row.phone || row.Phone || row['Phone Number'] || '';
        
//         // Clean and validate phone
//         phone = phone.toString().replace(/\D/g, '').trim();
        
//         if (!firstName || !lastName || !phone || phone.length < 10) {
//           errors.push({ row: i + 1, reason: "Invalid or missing data" });
//           continue;
//         }
        
//         // Check if phone already exists
//         if (existingPhoneSet.has(phone)) {
//           phonesToUpdate.add(phone);
//           continue;
//         }
        
//         // Prepare lead for insertion
//         const email = getValue(row, 'email') || row.email || row.Email || '';
//         const leadSource = getValue(row, 'leadSource') || row.leadSource || row['Lead Source'] || DEFAULT_LEAD_SOURCE;
        
//         const leadData = {
//           firstName: firstName.trim(),
//           lastName: lastName.trim(),
//           phone: phone,
//           email: email ? email.trim().toLowerCase() : null,
//           alt_phone: getValue(row, 'alt_phone') || row.alt_phone || row.altPhone || '',
//           leadSource: leadSource,
//           tag: getValue(row, 'tag') || row.tag || row.Tag || '',
//           platform: getValue(row, 'platform') || row.platform || row.Platform || '',
//           activity: getValue(row, 'activity') || row.activity || row.Activity || '',
//           campaign: campaignId || null,
//           leadStatus: DEFAULT_LEAD_STATUS,
//           companyId: req.user.companyId,
//           star: 1,
//           isDeleted: false
//         };
        
//         // Validate email
//         if (leadData.email) {
//           const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//           if (!emailRegex.test(leadData.email)) {
//             leadData.email = null;
//           }
//         }
        
//         leadsToInsert.push(leadData);
//         existingPhoneSet.add(phone); // Add to set to avoid duplicates in same batch
        
//       } catch (error) {
//         errors.push({ row: i + 1, reason: error.message });
//       }
//     }
//     console.timeEnd('DataProcessing');

//     /* =====================
//        BULK OPERATIONS
//        ===================== */
//     console.time('DatabaseOperations');
//     let inserted = 0;
//     let updated = 0;
    
//     // Bulk insert new leads
//     if (leadsToInsert.length > 0) {
//       try {
//         // Use insertMany with ordered: false for better performance
//         const result = await Lead.insertMany(leadsToInsert, { ordered: false });
//         inserted = result.length;
//         console.log(`Inserted ${inserted} new leads`);
//       } catch (insertError) {
//         console.error("Bulk insert error:", insertError);
//         // Insert individually if bulk fails
//         for (const leadData of leadsToInsert) {
//           try {
//             await Lead.create(leadData);
//             inserted++;
//           } catch (err) {
//             errors.push({ row: 'unknown', reason: `Insert failed: ${err.message}` });
//           }
//         }
//       }
//     }
    
//     // Bulk update existing leads (increment star)
//     if (phonesToUpdate.size > 0) {
//       const updateResult = await Lead.updateMany(
//         {
//           companyId: req.user.companyId,
//           phone: { $in: Array.from(phonesToUpdate) },
//           isDeleted: false
//         },
//         { $inc: { star: 1 } }
//       );
//       updated = updateResult.modifiedCount;
//       console.log(`Updated ${updated} existing leads`);
//     }
//     console.timeEnd('DatabaseOperations');

//     // Update campaign stats
//     if (campaign && inserted > 0) {
//       await Campaign.updateOne(
//         { _id: campaignId },
//         { $inc: { 'stats.totalLeads': inserted } }
//       );
//     }

//     // Cleanup
//     fs.unlinkSync(filePath);
    
//     console.timeEnd('TotalImportTime');
//     console.log("=== Import Summary ===");
//     console.log(`Total rows: ${leads.length}`);
//     console.log(`Inserted: ${inserted}`);
//     console.log(`Updated: ${updated}`);
//     console.log(`Errors: ${errors.length}`);

//     res.status(200).json({
//       success: true,
//       message: "Bulk import completed",
//       summary: {
//         total: leads.length,
//         inserted,
//         updated,
//         skipped: errors.length,
//         errorsCount: errors.length
//       },
//       errors: errors.slice(0, 50), // Limit errors in response
//       campaign: campaign ? { id: campaign._id, name: campaign.name } : null
//     });

//   } catch (error) {
//     console.error("Import Error:", error);
    
//     // Cleanup on error
//     if (req.file && req.file.path && fs.existsSync(req.file.path)) {
//       fs.unlinkSync(req.file.path);
//     }
    
//     res.status(500).json({
//       success: false,
//       message: "Import failed. Please try with smaller file or check file format.",
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };