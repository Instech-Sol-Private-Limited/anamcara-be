import { Request, Response } from 'express';
import { supabase } from '../app';
import { generateCampaignDescription } from '../services/openai.service';

interface CampaignFormValues {
    title: string;
    visuals: string[];
    existingVisuals: string[];
    soulWords: string;
    goalType: 'fixed' | 'open-ended';
    goalAmount: number;
    baseAmount: number;
    timeline: string;
    endDate: string;
    category: string | null;
    verification: boolean;
    description: string;
    campaignType: 'simple' | 'auction';
    matchChallenges: boolean;
    offeredProduct: { id: string; title: string } | null;
}

interface CreateCampaignRequest {
    user_id: string;
    title: string;
    visuals: string[];
    soul_words: string;
    goal_type: 'fixed' | 'open-ended';
    goal_amount: number;
    base_amount: number;
    deadline: string | null;
    category_type: string | null;
    verification: boolean;
    description: string;
    donation_info?: string;
    campaign_type: 'simple_donation' | 'auction_donation';
    match_challenges: boolean;
    boost_campaign?: boolean;
    offer_product_id?: string | null;
}

const createCampaign = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            title,
            visuals,
            soulWords,
            goalType,
            goalAmount,
            baseAmount,
            endDate,
            category,
            verification,
            description,
            campaignType,
            matchChallenges,
            offeredProduct
        } = req.body as CampaignFormValues;

        const userId = (req as any).user?.id;

        if (campaignType === 'simple' && goalType === 'fixed' && (!goalAmount || goalAmount < 100)) {
            return res.status(400).json({
                success: false,
                message: 'Goal amount must be at least 100 AC for fixed campaigns'
            });
        }

        if (campaignType === 'auction' && (!baseAmount || baseAmount < 10)) {
            return res.status(400).json({
                success: false,
                message: 'Base amount must be at least 10 AC for auction campaigns'
            });
        }

        if ((campaignType === 'auction' || (campaignType === 'simple' && goalType === 'open-ended')) &&
            (!endDate || new Date(endDate) <= new Date())) {
            return res.status(400).json({
                success: false,
                message: 'End date must be in the future for this campaign type'
            });
        }

        if (campaignType === 'auction' && !offeredProduct) {
            return res.status(400).json({
                success: false,
                message: 'Please select a product to offer for auction'
            });
        }

        const campaignData: CreateCampaignRequest = {
            user_id: userId,
            title,
            visuals: visuals,
            soul_words: soulWords,
            goal_type: goalType,
            goal_amount: goalAmount,
            base_amount: baseAmount,
            deadline: endDate || null,
            category_type: category,
            verification,
            description,
            campaign_type: campaignType === 'simple' ? 'simple_donation' : 'auction_donation',
            match_challenges: matchChallenges,
            boost_campaign: false,
            offer_product_id: offeredProduct?.id || null
        };

        if (campaignType === 'simple') {
            campaignData.donation_info = description;
        }


        const { data: campaign, error: dbError } = await supabase
            .from('hope_campaigns')
            .insert(campaignData)
            .select()
            .single();

        if (dbError) {
            console.error('Database error:', dbError);
            throw new Error(`Database error: ${dbError.message}`);
        }

        if (!campaign) {
            throw new Error('No campaign data returned from database');
        }

        res.status(201).json({
            success: true,
            message: 'Campaign created successfully. Pending admin approval.',
            campaign
        });

    } catch (error: any) {
        console.error('Error creating campaign:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create campaign'
        });
    }
};

const generateCampaignDesc = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            soulWords,
            category,
            campaignType,
            goalType,
            goalAmount,
            baseAmount
        } = req.body;

        // Validation
        if (!soulWords || !category || !campaignType) {
            res.status(400).json({
                success: false,
                message: 'Missing required fields: soulWords, category, and campaignType are required'
            });
            return;
        }

        if (typeof soulWords !== 'string' || soulWords.length < 50) {
            res.status(400).json({
                success: false,
                message: 'Soul Words must be a string with at least 50 characters'
            });
            return;
        }

        if (typeof category !== 'object' || !category.category || !category.subCategory) {
            res.status(400).json({
                success: false,
                message: 'Category must be an object with category and subCategory properties'
            });
            return;
        }

        if (!['simple', 'auction'].includes(campaignType)) {
            res.status(400).json({
                success: false,
                message: 'campaignType must be either "simple" or "auction"'
            });
            return;
        }

        if (campaignType === 'simple') {
            if (goalType && !['fixed', 'open-ended'].includes(goalType)) {
                res.status(400).json({
                    success: false,
                    message: 'goalType must be either "fixed" or "open-ended" for simple campaigns'
                });
                return;
            }
        }

        const aiDescription = await generateCampaignDescription({
            soulWords,
            category,
            campaignType,
            goalType: goalType || undefined,
            goalAmount: goalAmount || undefined,
            baseAmount: baseAmount || undefined
        });

        res.status(200).json({ description: aiDescription });

    } catch (error) {
        console.error('Error in generateCampaignDescription controller:', error);

        res.status(500).json({
            success: false,
            message: 'Internal server error while generating campaign description'
        });
    }
};

const getPendingApprovalCampaigns = async (req: Request, res: Response): Promise<any> => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const { data: campaigns, error, count } = await supabase
            .from('hope_campaigns')
            .select('*, creator:user_id(first_name, last_name, email, avatar_url)', { count: 'exact' })
            .eq('is_approved', false)
            .order('created_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (error) {
            console.error('Database error:', error);
            throw new Error(`Database error: ${error.message}`);
        }

        res.status(200).json({
            success: true,
            data: campaigns,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / Number(limit))
            }
        });

    } catch (error: any) {
        console.error('Error fetching pending campaigns:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch pending campaigns'
        });
    }
};

const getAllCampaigns = async (req: Request, res: Response): Promise<any> => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const { data: campaigns, error, count } = await supabase
            .from('hope_campaigns')
            .select('*, creator:user_id(first_name, last_name, email, avatar_url)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (error) {
            console.error('Database error:', error);
            throw new Error(`Database error: ${error.message}`);
        }

        res.status(200).json({
            success: true,
            data: campaigns,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / Number(limit))
            }
        });

    } catch (error: any) {
        console.error('Error fetching pending campaigns:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch pending campaigns'
        });
    }
};

const getApprovedCampaigns = async (req: Request, res: Response): Promise<any> => {
    try {
        const { page = 1, limit = 10, category, campaignType, status = 'active' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = supabase
            .from('hope_campaigns')
            .select('*, creator:user_id(first_name, last_name, email, avatar_url), offered_product:offer_product_id(*)', { count: 'exact' })
            .eq('is_approved', true)
            .order('created_at', { ascending: false });

        // Apply filters if provided
        if (category) {
            query = query.eq('category_type', category);
        }

        if (campaignType) {
            query = query.eq('campaign_type', campaignType);
        }

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        const { data: campaigns, error, count } = await query
            .range(offset, offset + Number(limit) - 1);

        if (error) {
            console.error('Database error:', error);
            throw new Error(`Database error: ${error.message}`);
        }

        res.status(200).json({
            success: true,
            data: campaigns,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / Number(limit))
            }
        });

    } catch (error: any) {
        console.error('Error fetching approved campaigns:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch approved campaigns'
        });
    }
};

const getUserCampaigns = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id;
        const { page = 1, limit = 10, status, approvalStatus } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }

        let query = supabase
            .from('hope_campaigns')
            .select('*, offered_product:offer_product_id(*)', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        // Filter by status if provided
        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        // Filter by approval status if provided
        if (approvalStatus === 'approved') {
            query = query.eq('is_approved', true);
        } else if (approvalStatus === 'pending') {
            query = query.eq('is_approved', false);
        }

        const { data: campaigns, error, count } = await query
            .range(offset, offset + Number(limit) - 1);

        if (error) {
            console.error('Database error:', error);
            throw new Error(`Database error: ${error.message}`);
        }

        res.status(200).json({
            success: true,
            data: campaigns,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / Number(limit))
            }
        });

    } catch (error: any) {
        console.error('Error fetching user campaigns:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch user campaigns'
        });
    }
};

const getCampaignDetails = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        // First, get the campaign details
        const { data: campaign, error: campaignError } = await supabase
            .from('hope_campaigns')
            .select('*, creator:user_id(first_name, last_name, email, avatar_url)')
            .eq('id', id)
            .single();

        if (campaignError) {
            console.error('Database error:', campaignError);
            if (campaignError.code === 'PGRST116') { // Not found
                return res.status(404).json({
                    success: false,
                    message: 'Campaign not found'
                });
            }
            throw new Error(`Database error: ${campaignError.message}`);
        }

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        // Only return approved campaigns to non-owners, unless user is admin or owner
        const userId = (req as any).user?.id;
        const isOwner = campaign.user_id === userId;
        const isAdmin = (req as any).user?.role === 'admin';

        if (!campaign.is_approved && !isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Campaign not available'
            });
        }

        // If this is an auction campaign with an offer_product_id, get the full product details
        let offeredProduct = null;
        if (campaign.campaign_type === 'auction_donation' && campaign.offer_product_id) {
            const { data: product, error: productError } = await supabase
                .from('products')
                .select(`
                    *,
                    creator:creator_id(first_name, last_name, email, avatar_url)
                `)
                .eq('id', campaign.offer_product_id)
                .single();

            if (productError) {
                console.error('Error fetching product details:', productError);
                // Don't fail the whole request if product fetch fails, just log it
            } else {
                offeredProduct = product;
            }
        }

        // Get donation and bid statistics
        let totalDonations = 0;
        let totalBids = 0;
        let highestBid = 0;

        if (campaign.campaign_type === 'simple_donation') {
            // Get total donations for simple donation campaigns
            const { data: donations, error: donationsError } = await supabase
                .from('campaign_donations')
                .select('amount')
                .eq('campaign_id', id)
                .eq('payment_status', 'completed');

            if (!donationsError && donations) {
                totalDonations = donations.reduce((sum, donation) => sum + (donation.amount || 0), 0);
            }
        } else if (campaign.campaign_type === 'auction_donation') {
            // Get bid statistics for auction campaigns
            const { data: bids, error: bidsError } = await supabase
                .from('campaign_bids')
                .select('amount')
                .eq('campaign_id', id)
                .order('amount', { ascending: false });

            if (!bidsError && bids && bids.length > 0) {
                totalBids = bids.length;
                highestBid = bids[0].amount;
            }
        }

        // Prepare the response with all the additional data
        const responseData = {
            ...campaign,
            offered_product: offeredProduct,
            total_donations: totalDonations,
            total_bids: totalBids,
            highest_bid: highestBid
        };

        res.status(200).json({
            success: true,
            data: responseData
        });

    } catch (error: any) {
        console.error('Error fetching campaign details:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch campaign details'
        });
    }
};

const approveCampaign = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const adminId = (req as any).user?.id;

        if (!adminId) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const { data: campaign, error: updateError } = await supabase
            .from('hope_campaigns')
            .update({
                is_approved: true,
                approved_at: new Date().toISOString(),
                approved_by: adminId
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Database error:', updateError);
            throw new Error(`Database error: ${updateError.message}`);
        }

        res.status(200).json({
            success: true,
            message: 'Campaign approved successfully',
            data: campaign
        });

    } catch (error: any) {
        console.error('Error approving campaign:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to approve campaign'
        });
    }
};

const updateCampaign = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const userId = (req as any).user?.id;

        const {
            title,
            visuals,
            soulWords,
            goalType,
            goalAmount,
            baseAmount,
            endDate,
            category,
            verification,
            description,
            matchChallenges,
            offeredProduct
        } = req.body as CampaignFormValues;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }

        const { data: existingCampaign, error: checkError } = await supabase
            .from('hope_campaigns')
            .select('user_id, is_approved, campaign_type, goal_type')
            .eq('id', id)
            .single();

        if (checkError) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        if (existingCampaign.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only update your own campaigns'
            });
        }

        if (existingCampaign.campaign_type === 'simple_donation' && existingCampaign.goal_type === 'fixed' && goalAmount && goalAmount < 100) {
            return res.status(400).json({
                success: false,
                message: 'Goal amount must be at least 100 AC for fixed campaigns'
            });
        }

        if (existingCampaign.campaign_type === 'auction_donation' && baseAmount && baseAmount < 10) {
            return res.status(400).json({
                success: false,
                message: 'Base amount must be at least 10 AC for auction campaigns'
            });
        }

        if ((existingCampaign.campaign_type === 'auction_donation' || 
             (existingCampaign.campaign_type === 'simple_donation' && existingCampaign.goal_type === 'open-ended')) &&
            endDate && new Date(endDate) <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'End date must be in the future for this campaign type'
            });
        }

        if (existingCampaign.campaign_type === 'auction_donation' && offeredProduct === null) {
            return res.status(400).json({
                success: false,
                message: 'Please select a product to offer for auction'
            });
        }

        const updateData: Partial<CreateCampaignRequest> = {
            title,
            visuals: visuals,
            soul_words: soulWords,
            goal_type: goalType,
            goal_amount: goalAmount,
            base_amount: baseAmount,
            deadline: endDate || null,
            category_type: category,
            verification,
            description,
            match_challenges: matchChallenges,
            offer_product_id: offeredProduct?.id || null,
        };

        if (existingCampaign.is_approved) {
            const restrictedFields = ['goal_type', 'goal_amount', 'base_amount', 'campaign_type', 'offer_product_id'];
            restrictedFields.forEach(field => delete (updateData as any)[field]);
            
            if (goalType && goalType !== existingCampaign.goal_type) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot change goal type for approved campaigns'
                });
            }
        }

        if (existingCampaign.campaign_type === 'simple_donation') {
            updateData.donation_info = description;
        }

        const { data: campaign, error: updateError } = await supabase
            .from('hope_campaigns')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Database error:', updateError);
            throw new Error(`Database error: ${updateError.message}`);
        }

        res.status(200).json({
            success: true,
            message: existingCampaign.is_approved 
                ? 'Campaign updated successfully (limited changes allowed for approved campaigns)' 
                : 'Campaign updated successfully',
            data: campaign
        });

    } catch (error: any) {
        console.error('Error updating campaign:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update campaign'
        });
    }
};

const pauseCampaign = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const userId = (req as any).user?.id;
        const { reason } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }

        const { data: existingCampaign, error: checkError } = await supabase
            .from('hope_campaigns')
            .select('user_id, status')
            .eq('id', id)
            .single();

        if (checkError) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        if (existingCampaign.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only modify your own campaigns'
            });
        }

        if (existingCampaign.status === 'closed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot pause a closed campaign'
            });
        }

        const { data: campaign, error: updateError } = await supabase
            .from('hope_campaigns')
            .update({
                status: 'paused',
                paused_reason: reason || 'Campaign paused by creator',
                paused_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Database error:', updateError);
            throw new Error(`Database error: ${updateError.message}`);
        }

        res.status(200).json({
            success: true,
            message: 'Campaign paused successfully',
            data: campaign
        });

    } catch (error: any) {
        console.error('Error pausing campaign:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to pause campaign'
        });
    }
};

const activateCampaign = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const userId = (req as any).user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }

        // Check if campaign exists and user owns it
        const { data: existingCampaign, error: checkError } = await supabase
            .from('hope_campaigns')
            .select('user_id, status, deadline')
            .eq('id', id)
            .single();

        if (checkError) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        if (existingCampaign.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only modify your own campaigns'
            });
        }

        if (existingCampaign.status === 'closed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot activate a closed campaign'
            });
        }

        // Check if campaign deadline has passed
        if (existingCampaign.deadline && new Date(existingCampaign.deadline) < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot activate campaign after its deadline has passed'
            });
        }

        const { data: campaign, error: updateError } = await supabase
            .from('hope_campaigns')
            .update({
                status: 'active',
                paused_reason: null,
                paused_at: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Database error:', updateError);
            throw new Error(`Database error: ${updateError.message}`);
        }

        res.status(200).json({
            success: true,
            message: 'Campaign activated successfully',
            data: campaign
        });

    } catch (error: any) {
        console.error('Error activating campaign:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to activate campaign'
        });
    }
};

const closeCampaign = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const userId = (req as any).user?.id;
        const { reason } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }

        // Check if campaign exists and user owns it
        const { data: existingCampaign, error: checkError } = await supabase
            .from('hope_campaigns')
            .select('user_id, status')
            .eq('id', id)
            .single();

        if (checkError) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        if (existingCampaign.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only modify your own campaigns'
            });
        }

        if (existingCampaign.status === 'closed') {
            return res.status(400).json({
                success: false,
                message: 'Campaign is already closed'
            });
        }

        const { data: campaign, error: updateError } = await supabase
            .from('hope_campaigns')
            .update({
                status: 'closed',
                closed_reason: reason || 'Campaign closed by creator',
                closed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Database error:', updateError);
            throw new Error(`Database error: ${updateError.message}`);
        }

        res.status(200).json({
            success: true,
            message: 'Campaign closed successfully',
            data: campaign
        });

    } catch (error: any) {
        console.error('Error closing campaign:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to close campaign'
        });
    }
};

const adminCloseCampaign = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const adminId = (req as any).user?.id;
        const { reason } = req.body;

        if (!adminId) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const { data: campaign, error: updateError } = await supabase
            .from('hope_campaigns')
            .update({
                status: 'closed',
                closed_reason: reason || 'Campaign closed by administrator',
                closed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Database error:', updateError);
            throw new Error(`Database error: ${updateError.message}`);
        }

        res.status(200).json({
            success: true,
            message: 'Campaign closed by admin successfully',
            data: campaign
        });

    } catch (error: any) {
        console.error('Error closing campaign by admin:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to close campaign'
        });
    }
};

export {
    createCampaign,
    generateCampaignDesc,
    getPendingApprovalCampaigns,
    getApprovedCampaigns,
    getUserCampaigns,
    getCampaignDetails,
    approveCampaign,
    updateCampaign,
    pauseCampaign,
    activateCampaign,
    closeCampaign,
    adminCloseCampaign,
    getAllCampaigns
};