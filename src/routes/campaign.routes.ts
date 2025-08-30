import express from 'express';

import { activateCampaign, adminCloseCampaign, approveCampaign, claimDonations, closeCampaign, createBid, createCampaign, createDonation, generateCampaignDesc, getAllCampaigns, getApprovedCampaigns, getCampaignBids, getCampaignDetails, getCampaignDonations, getPendingApprovalCampaigns, getUserCampaigns, getOverallTotals, pauseCampaign, updateCampaign } from '../controllers/campaign.controller';
const router = express.Router();

router.post('/create-campaign', createCampaign);

router.post('/generate-description', generateCampaignDesc);

router.get('/pending-approvals', getPendingApprovalCampaigns);

router.get('/get-all-campaigns', getAllCampaigns);

router.get('/get-hope-campaigns', getApprovedCampaigns);

router.get('/get-user-campaigns', getUserCampaigns);

router.get('/get-campaign/:id', getCampaignDetails);

router.patch('/:id/approve', approveCampaign);

router.put('/:id', updateCampaign);

router.patch('/:id/pause', pauseCampaign);

router.patch('/:id/activate', activateCampaign);

router.patch('/:id/close', closeCampaign);

router.patch('/:id/admin-close', adminCloseCampaign);

// Bidding routes
router.get('/bids/:campaign_id', getCampaignBids);

router.post('/bids', createBid);

// Donation routes
router.get('/donations/:campaign_id', getCampaignDonations);

router.post('/donations', createDonation);

router.get('/get-total-donations', getOverallTotals);

router.post('/:id/claim', claimDonations);

export default router;
