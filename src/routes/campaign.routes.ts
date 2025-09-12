import express from 'express';

import { activateCampaign, adminCloseCampaign, approveCampaign, claimDonations, closeCampaign, createBid, createCampaign, createDonation, generateCampaignDesc, getAllCampaigns, getApprovedCampaigns, getCampaignBids, getCampaignDetails, getCampaignDonations, getPendingApprovalCampaigns, getUserCampaigns, getOverallTotals, pauseCampaign, updateCampaign, createBoost } from '../controllers/campaign.controller';
import { getActiveFeaturedProducts } from '../controllers/products.controller';
const router = express.Router();

router.post('/create-campaign', createCampaign);

router.post('/generate-description', generateCampaignDesc);

router.get('/pending-approvals', getPendingApprovalCampaigns);

router.get('/get-all-campaigns', getAllCampaigns);

router.get('/get-hope-campaigns', getApprovedCampaigns);

router.get('/get-user-campaigns/:id', getUserCampaigns);

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


// -------------- Campaign boost and promotion Route --------------
router.post('/boost/create', createBoost);

router.get('/get-featured-products', getActiveFeaturedProducts);

// admin route
// router.get('/boost/active/:productId', getActiveBoosts);

// router.get('/boost/user-boosts', getUserBoosts);

export default router;
