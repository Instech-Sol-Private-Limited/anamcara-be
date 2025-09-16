"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const campaign_controller_1 = require("../controllers/campaign.controller");
const products_controller_1 = require("../controllers/products.controller");
const router = express_1.default.Router();
router.post('/create-campaign', campaign_controller_1.createCampaign);
router.post('/generate-description', campaign_controller_1.generateCampaignDesc);
router.get('/pending-approvals', campaign_controller_1.getPendingApprovalCampaigns);
router.get('/get-all-campaigns', campaign_controller_1.getAllCampaigns);
router.get('/get-hope-campaigns', campaign_controller_1.getApprovedCampaigns);
router.get('/get-user-campaigns/:id', campaign_controller_1.getUserCampaigns);
router.get('/get-campaign/:id', campaign_controller_1.getCampaignDetails);
router.patch('/:id/approve', campaign_controller_1.approveCampaign);
router.put('/:id', campaign_controller_1.updateCampaign);
router.patch('/:id/pause', campaign_controller_1.pauseCampaign);
router.patch('/:id/activate', campaign_controller_1.activateCampaign);
router.patch('/:id/close', campaign_controller_1.closeCampaign);
router.patch('/:id/admin-close', campaign_controller_1.adminCloseCampaign);
// Bidding routes
router.get('/bids/:campaign_id', campaign_controller_1.getCampaignBids);
router.post('/bids', campaign_controller_1.createBid);
// Donation routes
router.get('/donations/:campaign_id', campaign_controller_1.getCampaignDonations);
router.post('/donations', campaign_controller_1.createDonation);
router.get('/get-total-donations', campaign_controller_1.getOverallTotals);
router.post('/:id/claim', campaign_controller_1.claimDonations);
// -------------- Campaign boost and promotion Route --------------
router.post('/boost/create', campaign_controller_1.createBoost);
router.get('/get-featured-products', products_controller_1.getActiveFeaturedProducts);
// admin route
// router.get('/boost/active/:productId', getActiveBoosts);
// router.get('/boost/user-boosts', getUserBoosts);
exports.default = router;
