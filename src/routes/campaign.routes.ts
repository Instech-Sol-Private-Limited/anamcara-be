import express from 'express';

import { activateCampaign, adminCloseCampaign, approveCampaign, claimDonations, closeCampaign, createBid, createCampaign, createDonation, generateCampaignDesc, getAllCampaigns, getApprovedCampaigns, getCampaignBids, getCampaignDetails, getCampaignDonations, getPendingApprovalCampaigns, getUserCampaigns, getOverallTotals, pauseCampaign, updateCampaign, createBoost, getBoostedCampaigns } from '../controllers/campaign.controller';
import { getActiveFeaturedProducts } from '../controllers/products.controller';
import { authMiddleware } from '../middleware/auth.middleware';
const router = express.Router();

router.post('/create-campaign', authMiddleware, createCampaign);

router.post('/generate-description', authMiddleware, generateCampaignDesc);

router.get('/pending-approvals', authMiddleware, getPendingApprovalCampaigns);

router.get('/get-all-campaigns', authMiddleware, getAllCampaigns);

router.get('/get-boosted-campaigns', getBoostedCampaigns);

router.get('/get-hope-campaigns', getApprovedCampaigns);

router.get('/get-user-campaigns/:id', authMiddleware, getUserCampaigns);

router.get('/get-campaign/:id', getCampaignDetails);

router.patch('/:id/approve', authMiddleware, approveCampaign);

router.put('/:id', authMiddleware, updateCampaign);

router.patch('/:id/pause', authMiddleware, pauseCampaign);

router.patch('/:id/activate', authMiddleware, activateCampaign);

router.patch('/:id/close', authMiddleware, closeCampaign);

router.patch('/:id/admin-close', authMiddleware, adminCloseCampaign);

// Bidding routes
router.get('/bids/:campaign_id', getCampaignBids);

router.post('/bids', authMiddleware, createBid);

// Donation routes
router.get('/donations/:campaign_id', getCampaignDonations);

router.post('/donations', authMiddleware, createDonation);

router.get('/get-total-donations', getOverallTotals);

router.post('/:id/claim', authMiddleware, claimDonations);


// -------------- Campaign boost and promotion Route --------------
router.post('/boost/create', authMiddleware, createBoost);

router.get('/get-featured-products', getActiveFeaturedProducts);

// admin route
// router.get('/boost/active/:productId', getActiveBoosts);

// router.get('/boost/user-boosts', getUserBoosts);

export default router;
