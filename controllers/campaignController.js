// controllers/campaignController.js
const Campaign = require("../models/Campaign");
const User = require("../models/User");
const Lead = require("../models/Lead");

// controllers/campaignController.js - Updated getCampaigns
// @desc    Get all campaigns
// @route   GET /api/campaigns
// @access  Private
exports.getCampaigns = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object - ADD COMPANY FILTER
    const filter = {
      companyId: req.user.companyId
    };

    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" };
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.manager) {
      filter.manager = req.query.manager;
    }

    if (req.query.priority) {
      filter.priority = req.query.priority;
    }

    if (req.query.leadDistribution) {
      filter.leadDistribution = req.query.leadDistribution;
    }

    // Get total count
    const total = await Campaign.countDocuments(filter);

    // Get campaigns with population
    const campaigns = await Campaign.find(filter)
      .populate("manager", "name email role")
      .populate("agents", "name email role")
      .sort({ created: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: campaigns,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get campaigns error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
// @desc    Get single campaign
// @route   GET /api/campaigns/:id
// @access  Private
exports.getCampaignById = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate("manager", "name email role mobile city")
      .populate("agents", "name email role mobile city");

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    res.status(200).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    console.error("Get campaign by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Create new campaign
// @route   POST /api/campaigns
// @access  Private (Admin/Manager)
exports.createCampaign = async (req, res) => {
  try {
    console.log('Creating campaign with data:', req.body);
    console.log('User creating campaign:', req.user);

    const {
      name,
      description,
      manager,
      pipeline = "course",
      // agents = [],
      leadDistribution = "ondemand",
      priority = "medium",
      status = "draft",
    } = req.body;

    // Basic validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Campaign name is required",
      });
    }

    if (!manager) {
      return res.status(400).json({
        success: false,
        message: "Campaign manager is required",
      });
    }

    // Validate manager exists and has appropriate role
    const managerUser = await User.findById(manager);
    if (!managerUser) {
      return res.status(400).json({
        success: false,
        message: "Selected manager not found",
      });
    }

    // Check if manager is admin or manager role
    if (!['admin', 'manager'].includes(managerUser.role)) {
      return res.status(400).json({
        success: false,
        message: "Selected manager must be an admin or manager",
      });
    }

    // Validate agents exist and have appropriate roles
    let validatedAgents = [];
    // if (agents && agents.length > 0) {
    //   const agentUsers = await User.find({ 
    //     _id: { $in: agents },
    //     role: { $in: ['salesperson', 'marketing'] }
    //   });
      
    //   // Check if all agents were found
    //   if (agentUsers.length !== agents.length) {
    //     return res.status(400).json({
    //       success: false,
    //       message: "Some selected agents are invalid or don't have appropriate roles",
    //     });
    //   }

    //   validatedAgents = agents;
    // }

    // Create campaign with companyId and createdBy
    const campaignData = {
      name,
      description,
      manager,
      pipeline,
      // agents: validatedAgents,
      leadDistribution,
      priority,
      status,
      companyId: req.user.companyId || req.user.company, // Adjust based on your user model
      createdBy: req.user._id,
    };

    console.log('Final campaign data to save:', campaignData);

    const campaign = new Campaign(campaignData);
    await campaign.save();

    // Populate before sending response
    const populatedCampaign = await Campaign.findById(campaign._id)
      .populate("manager", "name email role")
      .populate("agents", "name email role");

    console.log('Campaign created successfully:', campaign._id);

    res.status(201).json({
      success: true,
      message: "Campaign created successfully",
      data: populatedCampaign,
    });
  } catch (error) {
    console.error("Create campaign error:", error);
    
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Campaign name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error creating campaign",
    });
  }
};

// @desc    Update campaign
// @route   PUT /api/campaigns/:id
// @access  Private (Admin/Manager)
exports.updateCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    // Validate manager if provided
    if (req.body.manager) {
      const managerUser = await User.findById(req.body.manager);
      if (!managerUser || !["admin", "manager"].includes(managerUser.role)) {
        return res.status(400).json({
          success: false,
          message: "Selected manager must be an admin or manager",
        });
      }
    }

    // Validate agents if provided
    if (req.body.agents && req.body.agents.length > 0) {
      const agentUsers = await User.find({ _id: { $in: req.body.agents } });
      const invalidAgents = agentUsers.filter(
        (user) => !["salesperson", "marketing"].includes(user.role)
      );
      
      if (invalidAgents.length > 0) {
        return res.status(400).json({
          success: false,
          message: "All agents must be salespersons or marketing users",
        });
      }
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key !== "_id" && key !== "__v") {
        campaign[key] = req.body[key];
      }
    });

    await campaign.save();

    // Populate before sending response
    await campaign.populate("manager", "name email role");
    await campaign.populate("agents", "name email role");

    res.status(200).json({
      success: true,
      message: "Campaign updated successfully",
      data: campaign,
    });
  } catch (error) {
    console.error("Update campaign error:", error);
    
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Delete campaign
// @route   DELETE /api/campaigns/:id
// @access  Private (Admin/Manager)
exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    // Check if campaign has leads assigned
    const leadCount = await Lead.countDocuments({ campaign: campaign._id });
    
    if (leadCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete campaign with assigned leads. Please reassign leads first.",
      });
    }

    await campaign.deleteOne();

    res.status(200).json({
      success: true,
      message: "Campaign deleted successfully",
    });
  } catch (error) {
    console.error("Delete campaign error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get campaign statistics
// @route   GET /api/campaigns/:id/stats
// @access  Private
exports.getCampaignStats = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    // Get lead statistics
    const totalLeads = await Lead.countDocuments({ campaign: campaign._id });
    const assignedLeads = await Lead.countDocuments({ 
      campaign: campaign._id,
      assigned_to: { $ne: null }
    });
    const convertedLeads = await Lead.countDocuments({ 
      campaign: campaign._id,
      leadStatus: "closed_won"
    });

    // Update campaign stats
    campaign.stats.totalLeads = totalLeads;
    campaign.stats.assignedLeads = assignedLeads;
    campaign.stats.convertedLeads = convertedLeads;
    await campaign.save();

    res.status(200).json({
      success: true,
      data: {
        campaign: campaign.name,
        stats: campaign.stats,
        leadCounts: {
          totalLeads,
          assignedLeads,
          convertedLeads,
          unassignedLeads: totalLeads - assignedLeads,
        },
        conversionRate: totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(2) : 0,
      },
    });
  } catch (error) {
    console.error("Get campaign stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Assign lead to campaign
// @route   POST /api/campaigns/:id/assign-lead
// @access  Private
exports.assignLeadToCampaign = async (req, res) => {
  try {
    const { leadId } = req.body;
    
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    // Check if campaign is active
    if (campaign.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Cannot assign lead to inactive campaign",
      });
    }

    // Assign lead to campaign
    lead.campaign = campaign._id;
    await lead.save();

    // Update campaign stats
    campaign.stats.totalLeads = (campaign.stats.totalLeads || 0) + 1;
    await campaign.save();

    res.status(200).json({
      success: true,
      message: "Lead assigned to campaign successfully",
      data: lead,
    });
  } catch (error) {
    console.error("Assign lead to campaign error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get campaign leads
// @route   GET /api/campaigns/:id/leads
// @access  Private
exports.getCampaignLeads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    const filter = { campaign: campaign._id };

    // Get total count
    const total = await Lead.countDocuments(filter);

    // Get leads
    const leads = await Lead.find(filter)
      .populate("assigned_to", "name email role")
      .populate("campaign", "name status priority")
      .sort({ created: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: leads,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get campaign leads error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


// exports.toggleCampaignStatus = async (req, res) => {
//   try {
//     const campaign = await Campaign.findById(req.params.id);

//     if (!campaign) {
//       return res.status(404).json({
//         success: false,
//         message: 'Campaign not found',
//       });
//     }

//     // Toggle between active and paused
//     const newStatus = campaign.status === 'active' ? 'paused' : 'active';
//     campaign.status = newStatus;
    
//     await campaign.save();

//     res.status(200).json({
//       success: true,
//       message: `Campaign ${newStatus === 'active' ? 'activated' : 'paused'} successfully`,
//       data: campaign,
//     });
//   } catch (error) {
//     console.error('Toggle campaign status error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error',
//     });
//   }
// };