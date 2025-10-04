"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const campaign_controller_1 = require("../controllers/campaign.controller");
const products_controller_1 = require("../controllers/products.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.post('/create-campaign', auth_middleware_1.authMiddleware, campaign_controller_1.createCampaign);
router.post('/generate-description', auth_middleware_1.authMiddleware, campaign_controller_1.generateCampaignDesc);
router.get('/pending-approvals', auth_middleware_1.authMiddleware, campaign_controller_1.getPendingApprovalCampaigns);
router.get('/get-all-campaigns', auth_middleware_1.authMiddleware, campaign_controller_1.getAllCampaigns);
router.get('/get-hope-campaigns', campaign_controller_1.getApprovedCampaigns);
router.get('/get-user-campaigns/:id', auth_middleware_1.authMiddleware, campaign_controller_1.getUserCampaigns);
router.get('/get-campaign/:id', campaign_controller_1.getCampaignDetails);
router.patch('/:id/approve', auth_middleware_1.authMiddleware, campaign_controller_1.approveCampaign);
router.put('/:id', auth_middleware_1.authMiddleware, campaign_controller_1.updateCampaign);
router.patch('/:id/pause', auth_middleware_1.authMiddleware, campaign_controller_1.pauseCampaign);
router.patch('/:id/activate', auth_middleware_1.authMiddleware, campaign_controller_1.activateCampaign);
router.patch('/:id/close', auth_middleware_1.authMiddleware, campaign_controller_1.closeCampaign);
router.patch('/:id/admin-close', auth_middleware_1.authMiddleware, campaign_controller_1.adminCloseCampaign);
// Bidding routes
router.get('/bids/:campaign_id', campaign_controller_1.getCampaignBids);
router.post('/bids', auth_middleware_1.authMiddleware, campaign_controller_1.createBid);
// Donation routes
router.get('/donations/:campaign_id', campaign_controller_1.getCampaignDonations);
router.post('/donations', auth_middleware_1.authMiddleware, campaign_controller_1.createDonation);
router.get('/get-total-donations', campaign_controller_1.getOverallTotals);
router.post('/:id/claim', auth_middleware_1.authMiddleware, campaign_controller_1.claimDonations);
// -------------- Campaign boost and promotion Route --------------
router.post('/boost/create', auth_middleware_1.authMiddleware, campaign_controller_1.createBoost);
router.get('/get-featured-products', products_controller_1.getActiveFeaturedProducts);
// admin route
// router.get('/boost/active/:productId', getActiveBoosts);
// router.get('/boost/user-boosts', getUserBoosts);
exports.default = router;
