import express from 'express';

import { activateCampaign, adminCloseCampaign, approveCampaign, closeCampaign, createCampaign, generateCampaignDesc, getAllCampaigns, getApprovedCampaigns, getCampaignDetails, getPendingApprovalCampaigns, getUserCampaigns, pauseCampaign, updateCampaign } from '../controllers/campaign.controller';
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

export default router;
