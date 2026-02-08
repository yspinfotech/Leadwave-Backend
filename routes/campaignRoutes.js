// routes/campaignRoutes.js - CORRECTED VERSION
'use strict';

// Make ABSOLUTELY SURE you're using Express Router
const express = require('express');
const router = express.Router();  // This should be Express Router

// Import middleware
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const ROLES = require('../config/roles');

// Import controllers
const {
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaignStats,
  assignLeadToCampaign,
  getCampaignLeads,
//   toggleCampaignStatus 
} = require('../controllers/campaignController');

// Test route first
router.get('/test', (req, res) => {
  res.json({ message: 'Campaign routes working!' });
});

/**
 * =========================
 * GET ALL CAMPAIGNS
 * =========================
 */
router.get('/', auth, getCampaigns);

/**
 * =========================
 * GET SINGLE CAMPAIGN
 * =========================
 */
router.get('/:id', auth, getCampaignById);

/**
 * =========================
 * GET CAMPAIGN STATISTICS
 * =========================
 */
router.get('/:id/stats', auth, getCampaignStats);

/**
 * =========================
 * GET CAMPAIGN LEADS
 * =========================
 */
router.get('/:id/leads', auth, getCampaignLeads);

/**
 * =========================
 * CREATE NEW CAMPAIGN
 * =========================
 */
router.post('/', auth, authorize(ROLES.ADMIN), createCampaign);

/**
 * =========================
 * UPDATE CAMPAIGN
 * =========================
 */
router.put('/:id', auth, authorize(ROLES.ADMIN, ROLES.MANAGER), updateCampaign);

/**
 * =========================
 * DELETE CAMPAIGN
 * =========================
 */
router.delete('/:id', auth, authorize(ROLES.ADMIN), deleteCampaign);

/**
 * =========================
 * TOGGLE CAMPAIGN STATUS
 * =========================
 * LINE 87 - Make sure toggleCampaignStatus exists!
 */
// router.put('/:id/toggle-status', auth, authorize(ROLES.ADMIN, ROLES.MANAGER), toggleCampaignStatus);

/**
 * =========================
 * ASSIGN LEAD TO CAMPAIGN
 * =========================
 */
router.post('/:id/assign-lead', auth, assignLeadToCampaign);

module.exports = router;