import { Request, Response } from 'express';
import { supabase } from '../app';
import { generateCampaignDescription } from '../services/openai.service';
import { transferProductToWinner } from '../services/campaign.service';

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
    acceptedCurrencies: string[];
    disclaimers?: any[] | null;
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
    accepted_currencies: string[];
    disclaimers?: any[] | null;
}

const validateDisclaimers = (disclaimers: any): boolean => {
    if (!Array.isArray(disclaimers)) return false;

    return disclaimers.every(disclaimer =>
        disclaimer &&
        typeof disclaimer === 'object' &&
        typeof disclaimer.type === 'string' &&
        typeof disclaimer.enabled === 'boolean'
    );
};

const processDisclaimers = (disclaimers: any[] | null | undefined): any[] | null => {
    if (!disclaimers || !Array.isArray(disclaimers)) {
        return null;
    }

    const enabledDisclaimers = disclaimers.filter(disclaimer => disclaimer.enabled);

    return enabledDisclaimers.length > 0 ? enabledDisclaimers : null;
};

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
            offeredProduct,
            acceptedCurrencies,
            disclaimers
        } = req.body as CampaignFormValues;

        const userId = (req as any).user?.id;

        // Validate required fields
        if (!title || !description || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: title, description are required'
            });
        }

        // Validate disclaimers if provided
        if (disclaimers !== undefined && disclaimers !== null && !validateDisclaimers(disclaimers)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid disclaimers format. Must be an array of objects with type and enabled properties.'
            });
        }

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

        // Validate accepted currencies
        if (!acceptedCurrencies || !Array.isArray(acceptedCurrencies) || acceptedCurrencies.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one currency must be accepted'
            });
        }

        // Process disclaimers (only store enabled ones)
        const processedDisclaimers = processDisclaimers(disclaimers);

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
            offer_product_id: offeredProduct?.id || null,
            accepted_currencies: acceptedCurrencies,
            disclaimers: processedDisclaimers
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
            .from("hope_campaigns")
            .select("*, creator:user_id(first_name, last_name, email, avatar_url)", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (error) {
            console.error("Database error:", error);
            throw new Error(`Database error: ${error.message}`);
        }

        if (!campaigns) {
            return res.status(200).json({
                success: true,
                data: [],
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: 0,
                    pages: 0
                }
            });
        }

        const now = new Date();
        const expiredCampaigns = campaigns.filter(
            (c: any) => c.deadline && new Date(c.deadline) <= now && c.status !== "closed"
        );

        if (expiredCampaigns.length > 0) {
            const expiredIds = expiredCampaigns.map((c: any) => c.id);

            const { error: updateError } = await supabase
                .from("hope_campaigns")
                .update({ status: "closed", updated_at: new Date().toISOString() })
                .in("id", expiredIds);

            if (updateError) {
                console.error("Failed to update expired campaigns:", updateError);
            }

            // Reflect status change in the response data
            campaigns.forEach((c: any) => {
                if (expiredIds.includes(c.id)) {
                    c.status = "closed";
                }
            });

            for (const c of expiredCampaigns) {
                if (c.campaign_type === 'auction_donation') {
                    await transferProductToWinner(c.id);
                }
            }
        }

        // Step 3: Send response
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
        console.error("Error fetching campaigns:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch campaigns"
        });
    }
};

const getBoostedCampaigns = async (req: Request, res: Response): Promise<any> => {
    try {
        const { data: campaigns, error } = await supabase
            .from("hope_campaigns")
            .select(`
                *,
                creator:user_id(first_name, last_name, email, avatar_url),
                offered_product:offer_product_id(*)
            `)
            .eq('boost_campaign', true)
            .eq('is_approved', true)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(8);

        if (error) {
            console.error("Database error:", error);
            return res.status(500).json({
                success: false,
                message: `Database error: ${error.message}`
            });
        }

        return res.status(200).json({
            success: true,
            data: campaigns || [],
            count: campaigns?.length || 0
        });

    } catch (error: any) {
        console.error("Error fetching boosted campaigns:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch boosted campaigns"
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

        const now = new Date();
        const expiredCampaigns = campaigns?.filter(c => c.deadline && new Date(c.deadline) < now);

        if (expiredCampaigns?.length) {
            const expiredIds = expiredCampaigns.map(c => c.id);

            const { error: updateError } = await supabase
                .from('hope_campaigns')
                .update({ status: 'closed', updated_at: new Date().toISOString() })
                .in('id', expiredIds);

            if (updateError) {
                console.error("Failed to update expired campaigns:", updateError);
            }

            campaigns.forEach(c => {
                if (expiredIds.includes(c.id)) {
                    c.status = 'closed';
                }
            });

            for (const c of expiredCampaigns) {
                if (c.campaign_type === 'auction_donation') {
                    await transferProductToWinner(c.id);
                }
            }
        }

        const filteredCampaigns = campaigns?.filter(c => c.status !== 'closed') || [];

        res.status(200).json({
            success: true,
            data: filteredCampaigns,
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

// const getUserCampaigns = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const userId = (req as any).user?.id;
//         const { page = 1, limit = 10, status, approvalStatus } = req.query;
//         const offset = (Number(page) - 1) * Number(limit);

//         if (!userId) {
//             return res.status(401).json({
//                 success: false,
//                 message: 'User authentication required'
//             });
//         }

//         let query = supabase
//             .from('hope_campaigns')
//             .select('*, creator:user_id(first_name, last_name, email, avatar_url), offered_product:offer_product_id(*)', { count: 'exact' })
//             .eq('user_id', userId)
//             .order('created_at', { ascending: false });

//         // Filter by status if provided
//         if (status && status !== 'all') {
//             query = query.eq('status', status);
//         }

//         // Filter by approval status if provided
//         if (approvalStatus === 'approved') {
//             query = query.eq('is_approved', true);
//         } else if (approvalStatus === 'pending') {
//             query = query.eq('is_approved', false);
//         }

//         const { data: campaigns, error, count } = await query
//             .range(offset, offset + Number(limit) - 1);

//         if (error) {
//             console.error('Database error:', error);
//             throw new Error(`Database error: ${error.message}`);
//         }

//         res.status(200).json({
//             success: true,
//             data: campaigns,
//             pagination: {
//                 page: Number(page),
//                 limit: Number(limit),
//                 total: count || 0,
//                 pages: Math.ceil((count || 0) / Number(limit))
//             }
//         });

//     } catch (error: any) {
//         console.error('Error fetching user campaigns:', error);
//         res.status(500).json({
//             success: false,
//             message: error.message || 'Failed to fetch user campaigns'
//         });
//     }
// };

// const getCampaignDetails = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { id } = req.params;

//         const { data: campaign, error: campaignError } = await supabase
//             .from('hope_campaigns')
//             .select('*, creator:user_id(first_name, last_name, email, avatar_url)')
//             .eq('id', id)
//             .single();

//         if (campaignError) {
//             console.error('Database error:', campaignError);
//             if (campaignError.code === 'PGRST116') {
//                 return res.status(404).json({
//                     success: false,
//                     message: 'Campaign not found'
//                 });
//             }
//             throw new Error(`Database error: ${campaignError.message}`);
//         }

//         if (!campaign) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Campaign not found'
//             });
//         }

//         let offeredProduct = null;
//         if (campaign.campaign_type === 'auction_donation' && campaign.offer_product_id) {
//             const { data: product, error: productError } = await supabase
//                 .from('products')
//                 .select(`
//                     *,
//                     creator:creator_id(first_name, last_name, email, avatar_url)
//                 `)
//                 .eq('id', campaign.offer_product_id)
//                 .single();

//             if (productError) {
//                 console.error('Error fetching product details:', productError);
//             } else {
//                 offeredProduct = product;
//             }
//         }

//         let totalBids = 0;
//         let highestBid = 0;

//         if (campaign.campaign_type === 'auction_donation') {
//             const { data: bids, error: bidsError } = await supabase
//                 .from('campaign_bids')
//                 .select('amount, currency')
//                 .eq('campaign_id', id)
//                 .order('created_at', { ascending: false });

//             if (!bidsError && bids && bids.length > 0) {
//                 totalBids = bids.length;

//                 const bidsInAB = bids.map(bid => {
//                     if (bid.currency === 'AC') {
//                         return bid.amount / 2;
//                     }
//                     return bid.amount;
//                 });

//                 highestBid = Math.max(...bidsInAB);
//             }
//         }

//         const responseData = {
//             ...campaign,
//             offered_product: offeredProduct,
//             total_bids: totalBids,
//             highest_bid: highestBid
//         };

//         res.status(200).json({
//             success: true,
//             data: responseData
//         });

//     } catch (error: any) {
//         console.error('Error fetching campaign details:', error);
//         res.status(500).json({
//             success: false,
//             message: error.message || 'Failed to fetch campaign details'
//         });
//     }
// };

// const getUserCampaigns = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const userId = (req as any).user?.id;
//         const { page = 1, limit = 10, status, approvalStatus } = req.query;
//         const offset = (Number(page) - 1) * Number(limit);

//         if (!userId) {
//             return res.status(401).json({
//                 success: false,
//                 message: 'User authentication required'
//             });
//         }

//         let query = supabase
//   .from('hope_campaigns')
//   .select(`
//     *,
//     creator:user_id(first_name, last_name, email, avatar_url),
//     offered_product:offer_product_id(*),
//     boosts:campaign_boost(*)
//   `, { count: 'exact' })
//   .eq('user_id', userId)
//   .order('created_at', { ascending: false });
//         if (status && status !== 'all') {
//             query = query.eq('status', status);
//         }

//         if (approvalStatus === 'approved') {
//             query = query.eq('is_approved', true);
//         } else if (approvalStatus === 'pending') {
//             query = query.eq('is_approved', false);
//         }

//         const { data: campaigns, error, count } = await query
//             .range(offset, offset + Number(limit) - 1);

//         if (error) {
//             console.error('Database error:', error);
//             throw new Error(`Database error: ${error.message}`);
//         }

//         const now = new Date();
//         for (const campaign of campaigns || []) {
//             if (campaign.deadline && new Date(campaign.deadline) <= now && campaign.status !== 'closed') {
//                 await supabase
//                     .from('hope_campaigns')
//                     .update({ status: 'closed' })
//                     .eq('id', campaign.id);

//                 campaign.status = 'closed';
//                 if (campaign.campaign_type === 'auction_donation') {
//                     await transferProductToWinner(campaign.id);
//                 }
//             }
//         }

//         res.status(200).json({
//             success: true,
//             data: campaigns,
//             pagination: {
//                 page: Number(page),
//                 limit: Number(limit),
//                 total: count || 0,
//                 pages: Math.ceil((count || 0) / Number(limit))
//             }
//         });

//     } catch (error: any) {
//         console.error('Error fetching user campaigns:', error);
//         res.status(500).json({
//             success: false,
//             message: error.message || 'Failed to fetch user campaigns'
//         });
//     }
// };


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
            .select(`
                *,
                creator:user_id(first_name, last_name, email, avatar_url),
                offered_product:offer_product_id(*),
                boosts:campaign_boost(
                    id,
                    boost_type,
                    boost_percentage,
                    boost_duration,
                    boost_cost,
                    start_time,
                    end_time,
                    status,
                    created_at,
                    updated_at
                )
            `, { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

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

        const now = new Date();

        // Process campaigns and update expired ones
        for (const campaign of campaigns || []) {
            // Handle campaign deadline expiry
            if (campaign.deadline && new Date(campaign.deadline) <= now && campaign.status !== 'closed') {
                await supabase
                    .from('hope_campaigns')
                    .update({ status: 'closed' })
                    .eq('id', campaign.id);

                campaign.status = 'closed';
                if (campaign.campaign_type === 'auction_donation') {
                    await transferProductToWinner(campaign.id);
                }
            }

            // Handle boost expiry - update expired boosts
            if (campaign.boosts && campaign.boosts.length > 0) {
                const expiredBoosts = campaign.boosts.filter((boost: any) =>
                    boost.status === 'active' && new Date(boost.end_time) <= now
                );

                if (expiredBoosts.length > 0) {
                    const expiredBoostIds = expiredBoosts.map((boost: { id: any; }) => boost.id);

                    // Update expired boosts in database
                    const { error: boostUpdateError } = await supabase
                        .from('campaign_boost')
                        .update({
                            status: 'expired',
                            updated_at: now.toISOString()
                        })
                        .in('id', expiredBoostIds);

                    if (boostUpdateError) {
                        console.error('Failed to update expired boosts:', boostUpdateError);
                    } else {
                        // Update the boost status in the response data
                        campaign.boosts.forEach((boost: any) => {
                            if (expiredBoostIds.includes(boost.id)) {
                                boost.status = 'expired';
                            }
                        });
                    }
                }
            }

            // Add computed boost fields for backward compatibility
            const activeBoost = campaign.boosts?.find((boost: any) =>
                boost.status === 'active' && new Date(boost.end_time) > now
            );

            campaign.is_boosted = !!activeBoost;
            if (activeBoost) {
                campaign.boost_details = {
                    boost_type: activeBoost.boost_type,
                    boost_percentage: activeBoost.boost_percentage,
                    boost_duration: activeBoost.boost_duration,
                    boost_expires_at: activeBoost.end_time
                };
            }
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

        const { data: campaign, error: campaignError } = await supabase
            .from('hope_campaigns')
            .select('*, creator:user_id(first_name, last_name, email, avatar_url)')
            .eq('id', id)
            .single();

        if (campaignError) {
            console.error('Database error:', campaignError);
            if (campaignError.code === 'PGRST116') {
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

        // 🔥 Check deadline
        const now = new Date();
        if (campaign.deadline && new Date(campaign.deadline) <= now && campaign.status !== 'closed') {
            await supabase
                .from('hope_campaigns')
                .update({ status: 'closed' })
                .eq('id', campaign.id);

            campaign.status = 'closed';
            if (campaign.campaign_type === 'auction_donation') {
                await transferProductToWinner(campaign.id);
            }
        }

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

            if (!productError) {
                offeredProduct = product;
            }
        }

        let totalBids = 0;
        let highestBid = 0;

        if (campaign.campaign_type === 'auction_donation') {
            const { data: bids, error: bidsError } = await supabase
                .from('campaign_bids')
                .select('amount, currency')
                .eq('campaign_id', id)
                .order('created_at', { ascending: false });

            if (!bidsError && bids?.length > 0) {
                totalBids = bids.length;
                const bidsInAB = bids.map(bid => bid.currency === 'AC' ? bid.amount / 2 : bid.amount);
                highestBid = Math.max(...bidsInAB);
            }
        }

        const responseData = {
            ...campaign,
            offered_product: offeredProduct,
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
                status: 'active',
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
            offeredProduct,
            acceptedCurrencies
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

        // Validate accepted currencies
        if (acceptedCurrencies && (!Array.isArray(acceptedCurrencies) || acceptedCurrencies.length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'At least one currency must be accepted'
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
            accepted_currencies: acceptedCurrencies // Add this line
        };

        if (existingCampaign.is_approved) {
            const restrictedFields = ['goal_type', 'goal_amount', 'base_amount', 'campaign_type', 'offer_product_id', 'accepted_currencies']; // Add accepted_currencies to restricted fields
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

const getCampaignBids = async (req: Request, res: Response): Promise<any> => {
    try {
        const { campaign_id } = req.params;
        const { limit = 50, offset = 0, sort_by = 'created_at', sort_order = 'desc' } = req.query;

        const { data: campaign, error: campaignError } = await supabase
            .from('hope_campaigns')
            .select('id, campaign_type')
            .eq('id', campaign_id)
            .single();

        if (campaignError || !campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        if (campaign.campaign_type !== 'auction_donation') {
            return res.status(400).json({
                success: false,
                message: 'This campaign is not an auction'
            });
        }

        const { data: bids, error, count } = await supabase
            .from('campaign_bids')
            .select(`
                *,
                bidder:bidder_id (
                    id,
                    first_name,
                    last_name,
                    avatar_url
                )
            `, { count: 'exact' })
            .eq('campaign_id', campaign_id)
            .order(sort_by as string, { ascending: sort_order === 'asc' })
            .range(offset as number, (offset as number) + (limit as number) - 1);

        if (error) {
            console.error('Database error:', error);
            throw new Error(`Database error: ${error.message}`);
        }

        res.status(200).json({
            success: true,
            data: bids,
            pagination: {
                total: count,
                limit: parseInt(limit as string),
                offset: parseInt(offset as string)
            }
        });

    } catch (error: any) {
        console.error('Error fetching bids:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch bids'
        });
    }
};

const getCampaignDonations = async (req: Request, res: Response): Promise<any> => {
    try {
        const { campaign_id } = req.params;
        const { limit = 50, offset = 0, sort_by = 'created_at', sort_order = 'desc' } = req.query;

        const { data: campaign, error: campaignError } = await supabase
            .from('hope_campaigns')
            .select('id')
            .eq('id', campaign_id)
            .single();

        if (campaignError || !campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        const { data: donations, error, count } = await supabase
            .from('campaign_donations')
            .select(`
                *,
                donor:donor_id (
                    id,
                    first_name,
                    last_name,
                    avatar_url
                )
            `, { count: 'exact' })
            .eq('campaign_id', campaign_id)
            .order(sort_by as string, { ascending: sort_order === 'asc' })
            .range(offset as number, (offset as number) + (limit as number) - 1);

        if (error) {
            console.error('Database error:', error);
            throw new Error(`Database error: ${error.message}`);
        }

        res.status(200).json({
            success: true,
            data: donations,
            pagination: {
                total: count,
                limit: parseInt(limit as string),
                offset: parseInt(offset as string)
            }
        });

    } catch (error: any) {
        console.error('Error fetching donations:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch donations'
        });
    }
};

const checkAndDeductAnamCoins = async (userId: string, amount: string, currency: string) => {
    try {
        const { data: anamCoins, error: coinsError } = await supabase
            .from('anamcoins')
            .select('available_coins,spent_coins')
            .eq('user_id', userId)
            .single();

        if (coinsError || !anamCoins) {
            throw new Error('Failed to fetch user coin balance');
        }

        let coinsRequired;
        let coinsToDeduct;

        if (currency === 'AC') {
            coinsRequired = amount;
            coinsToDeduct = amount;
        } else if (currency === 'AB') {
            coinsRequired = Math.ceil(Number(amount) / 2);
            coinsToDeduct = Number(amount) / 2;
        } else {
            throw new Error('Invalid currency');
        }

        // Check if user has sufficient coins
        if (anamCoins.available_coins < coinsRequired) {
            return {
                success: false,
                message: `Insufficient anamcoins balance. Required: ${coinsRequired} AC, Available: ${anamCoins.available_coins} AC`
            };
        }

        // Deduct coins from user's balance
        const { error: updateError } = await supabase
            .from('anamcoins')
            .update({
                available_coins: Number(anamCoins.available_coins) - Number(coinsToDeduct),
                spent_coins: Number(anamCoins.spent_coins || 0) + Number(coinsToDeduct),
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);

        if (updateError) {
            throw new Error(`Failed to deduct coins: ${updateError.message}`);
        }

        return {
            success: true,
            deductedAmount: coinsToDeduct
        };

    } catch (error) {
        console.error('Error in checkAndDeductAnamCoins:', error);
        throw error;
    }
};

const refundAnamCoins = async (userId: string, amount: string,) => {
    try {
        const { error: refundError } = await supabase
            .rpc('refund_anam_coins', {
                p_user_id: userId,
                p_amount: amount
            });

        if (refundError) {
            console.error('Failed to refund coins:', refundError);
        }
    } catch (error) {
        console.error('Error in refundAnamCoins:', error);
    }
};

// const createBid = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const userId = (req as any).user?.id!;
//         const { campaign_id, amount, currency } = req.body;

//         if (!campaign_id || !amount || !currency) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Campaign ID, amount, and currency are required'
//             });
//         }

//         if (!['AC', 'AB'].includes(currency)) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Invalid currency. Only AC and AB are allowed'
//             });
//         }

//         const { data: campaign, error: campaignError } = await supabase
//             .from('hope_campaigns')
//             .select('id, campaign_type, status, deadline, base_amount, highest_bid, accepted_currencies')
//             .eq('id', campaign_id)
//             .single();

//         if (campaignError || !campaign) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Campaign not found'
//             });
//         }

//         if (
//             Array.isArray(campaign.accepted_currencies) &&
//             !campaign.accepted_currencies.includes(currency)
//         ) {
//             return res.status(400).json({
//                 success: false,
//                 message: `This campaign only accepts: ${campaign.accepted_currencies.join(', ')}`
//             });
//         }

//         if (campaign.campaign_type !== 'auction_donation') {
//             return res.status(400).json({
//                 success: false,
//                 message: 'This campaign is not an auction'
//             });
//         }

//         if (campaign.status !== 'active') {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Campaign is not active for bidding'
//             });
//         }

//         if (campaign.deadline && new Date(campaign.deadline) < new Date()) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Auction has ended'
//             });
//         }

//         const { data: currentBids, error: bidsError } = await supabase
//             .from('campaign_bids')
//             .select('amount, currency')
//             .eq('campaign_id', campaign_id)
//             .order('amount', { ascending: false })
//             .limit(1);

//         if (bidsError) {
//             console.error('Error fetching current bids:', bidsError);
//             throw new Error('Failed to validate bid amount');
//         }

//         const minBid = campaign.base_amount || 0;
//         const currentHighestBid = currentBids?.[0];
//         const currentHighestAmount = currentHighestBid?.amount || 0;
//         const currentHighestCurrency = currentHighestBid?.currency || 'AC';
//         let currentHighestAC;
//         if (currentHighestCurrency === 'AC') {
//             currentHighestAC = currentHighestAmount;
//         } else {
//             currentHighestAC = currentHighestAmount / 2;
//         }

//         if (amount < minBid) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Bid amount must be at least ${minBid} ${currency}`
//             });
//         }

//         if (currentHighestBid) {
//             let equivalentAmount;
//             if (currency === 'AC') {
//                 equivalentAmount = Number(amount);
//             } else {
//                 equivalentAmount = Number(amount) / 2;
//             }

//             if (equivalentAmount <= currentHighestAC) {
//                 let minRequiredBid;
//                 if (currency === 'AC') {
//                     minRequiredBid = currentHighestAC + 0.01;
//                 } else {
//                     minRequiredBid = (currentHighestAC * 2) + 0.01;
//                 }

//                 return res.status(400).json({
//                     success: false,
//                     message: `Bid amount must be higher than current highest bid. Minimum required: ${minRequiredBid.toFixed(2)} ${currency}`
//                 });
//             }
//         } else {
//             if (amount <= minBid) {
//                 return res.status(400).json({
//                     success: false,
//                     message: `Bid amount must be higher than minimum bid of ${minBid} ${currency}`
//                 });
//             }
//         }

//         const coinCheck = await checkAndDeductAnamCoins(userId, amount, currency);
//         if (!coinCheck.success) {
//             return res.status(400).json({
//                 success: false,
//                 message: coinCheck.message
//             });
//         }

//         // Create bid with currency
//         const { data: bid, error: bidError } = await supabase
//             .rpc('create_campaign_bid', {
//                 p_campaign_id: campaign_id,
//                 p_bidder_id: userId,
//                 p_amount: amount,
//                 p_currency: currency
//             });

//         if (bidError) {
//             console.error('Database error:', bidError);
//             await refundAnamCoins(userId, String(coinCheck.deductedAmount));

//             throw new Error(`Database error: ${bidError.message}`);
//         }

//         res.status(201).json({
//             success: true,
//             message: 'Bid placed successfully',
//             data: bid
//         });

//     } catch (error: any) {
//         console.error('Error creating bid:', error);
//         res.status(500).json({
//             success: false,
//             message: error.message || 'Failed to place bid'
//         });
//     }
// };

const createBid = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id!;
        const { campaign_id, amount, currency } = req.body;

        if (!campaign_id || !amount || !currency) {
            return res.status(400).json({
                success: false,
                message: 'Campaign ID, amount, and currency are required'
            });
        }

        if (!['AC', 'AB'].includes(currency)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid currency. Only AC and AB are allowed'
            });
        }

        const { data: campaign, error: campaignError } = await supabase
            .from('hope_campaigns')
            .select('id, campaign_type, status, deadline, base_amount, highest_bid, accepted_currencies')
            .eq('id', campaign_id)
            .single();

        if (campaignError || !campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        if (campaign.deadline && new Date(campaign.deadline) < new Date()) {
            if (campaign.status === 'active') {
                await supabase
                    .from('hope_campaigns')
                    .update({ status: 'closed', updated_at: new Date().toISOString() })
                    .eq('id', campaign.id);


                await transferProductToWinner(campaign.id);
            }
            return res.status(400).json({
                success: false,
                message: 'Auction has ended'
            });
        }

        if (
            Array.isArray(campaign.accepted_currencies) &&
            !campaign.accepted_currencies.includes(currency)
        ) {
            return res.status(400).json({
                success: false,
                message: `This campaign only accepts: ${campaign.accepted_currencies.join(', ')}`
            });
        }

        if (campaign.campaign_type !== 'auction_donation') {
            return res.status(400).json({
                success: false,
                message: 'This campaign is not an auction'
            });
        }

        if (campaign.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'Campaign is not active for bidding'
            });
        }

        // fetch current highest bid
        const { data: currentBids, error: bidsError } = await supabase
            .from('campaign_bids')
            .select('amount, currency')
            .eq('campaign_id', campaign_id)
            .order('amount', { ascending: false })
            .limit(1);

        if (bidsError) {
            console.error('Error fetching current bids:', bidsError);
            throw new Error('Failed to validate bid amount');
        }

        const minBid = campaign.base_amount || 0;
        const currentHighestBid = currentBids?.[0];
        const currentHighestAmount = currentHighestBid?.amount || 0;
        const currentHighestCurrency = currentHighestBid?.currency || 'AC';

        let currentHighestAC;
        if (currentHighestCurrency === 'AC') {
            currentHighestAC = currentHighestAmount;
        } else {
            currentHighestAC = currentHighestAmount / 2;
        }

        // ✅ validate minimum bid
        if (amount < minBid) {
            return res.status(400).json({
                success: false,
                message: `Bid amount must be at least ${minBid} ${currency}`
            });
        }

        if (currentHighestBid) {
            let equivalentAmount = currency === 'AC' ? Number(amount) : Number(amount) / 2;

            if (equivalentAmount <= currentHighestAC) {
                let minRequiredBid;
                if (currency === 'AC') {
                    minRequiredBid = currentHighestAC + 0.01;
                } else {
                    minRequiredBid = (currentHighestAC * 2) + 0.01;
                }

                return res.status(400).json({
                    success: false,
                    message: `Bid amount must be higher than current highest bid. Minimum required: ${minRequiredBid.toFixed(2)} ${currency}`
                });
            }
        } else {
            if (amount <= minBid) {
                return res.status(400).json({
                    success: false,
                    message: `Bid amount must be higher than minimum bid of ${minBid} ${currency}`
                });
            }
        }

        const coinCheck = await checkAndDeductAnamCoins(userId, amount, currency);
        if (!coinCheck.success) {
            return res.status(400).json({
                success: false,
                message: coinCheck.message
            });
        }

        // Create bid
        const { data: bid, error: bidError } = await supabase
            .rpc('create_campaign_bid', {
                p_campaign_id: campaign_id,
                p_bidder_id: userId,
                p_amount: amount,
                p_currency: currency
            });

        if (bidError) {
            console.error('Database error:', bidError);
            await refundAnamCoins(userId, String(coinCheck.deductedAmount));
            throw new Error(`Database error: ${bidError.message}`);
        }

        res.status(201).json({
            success: true,
            message: 'Bid placed successfully',
            data: bid
        });

    } catch (error: any) {
        console.error('Error creating bid:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to place bid'
        });
    }
};

const createDonation = async (req: Request, res: Response): Promise<any> => {
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        const userId = (req as any).user?.id;
        const { campaign_id, amount, currency, anonymously_donated = false } = req.body;

        if (!campaign_id || !amount || !currency) {
            return res.status(400).json({
                success: false,
                message: 'Campaign ID, amount, and currency are required'
            });
        }

        if (!['AC', 'AB'].includes(currency)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid currency. Only AC and AB are allowed'
            });
        }

        if (amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Donation amount must be positive'
            });
        }

        const { data: campaign, error: campaignError } = await supabase
            .from('hope_campaigns')
            .select('id, campaign_type, goal_type, goal_amount, total_donations, status, deadline, accepted_currencies, title, user_id')
            .eq('id', campaign_id)
            .single();

        if (campaignError || !campaign) {
            console.error(`[${transactionId}] Campaign fetch error:`, campaignError);
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        if (campaign.deadline && new Date(campaign.deadline) < new Date()) {

            const { error: updateError } = await supabase
                .from('hope_campaigns')
                .update({
                    status: 'closed',
                    closed_reason: 'Campaign deadline has passed',
                    closed_at: new Date().toISOString()
                })
                .eq('id', campaign_id);

            if (updateError) {
                console.error(`[${transactionId}] Failed to close campaign after deadline:`, updateError);
            }

            return res.status(400).json({
                success: false,
                message: 'Donation declined. Campaign deadline has passed and it is now closed.'
            });
        }

        if (campaign.campaign_type !== 'simple_donation') {
            return res.status(400).json({
                success: false,
                message: 'This campaign is not a simple donation campaign'
            });
        }

        if (
            Array.isArray(campaign.accepted_currencies) &&
            !campaign.accepted_currencies.includes(currency)
        ) {
            return res.status(400).json({
                success: false,
                message: `This campaign only accepts: ${campaign.accepted_currencies.join(', ')}`
            });
        }

        if (campaign.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: `Campaign is not active for donations. Current status: ${campaign.status}`
            });
        }

        const { data: existingDonation } = await supabase
            .from('campaign_donations')
            .select('id')
            .eq('campaign_id', campaign_id)
            .eq('donor_id', userId)
            .single();

        if (existingDonation) {
            return res.status(400).json({
                success: false,
                message: 'You have already donated to this campaign'
            });
        }

        const newTotalDonations = campaign.total_donations + amount;
        const willReachGoal = campaign.goal_type === 'fixed' &&
            campaign.goal_amount &&
            newTotalDonations >= campaign.goal_amount;

        const { data: donation, error: donationError } = await supabase.rpc('create_campaign_donation', {
            p_campaign_id: campaign_id,
            p_donor_id: userId,
            p_amount: amount,
            p_currency: currency,
            p_anonymously_donated: anonymously_donated
        });

        if (donationError) {
            console.error(`[${transactionId}] Donation creation error:`, donationError);
            throw new Error(`Database error: ${donationError.message}`);
        }

        const { error: updateDonationError } = await supabase
            .from('hope_campaigns')
            .update({ total_donations: newTotalDonations })
            .eq('id', campaign_id);

        if (updateDonationError) {
            console.error(`[${transactionId}] Failed to update campaign donations:`, updateDonationError);
            throw new Error(`Failed to update campaign donations: ${updateDonationError.message}`);
        }

        if (willReachGoal) {

            const { error: closeError } = await supabase
                .from('hope_campaigns')
                .update({
                    status: 'closed',
                    closed_reason: 'Campaign goal has been reached',
                    closed_at: new Date().toISOString()
                })
                .eq('id', campaign_id);

            if (closeError) {
                console.error(`[${transactionId}] Failed to close campaign after goal reached:`, closeError);
            } else {
                try {
                    await supabase
                        .from('notifications')
                        .insert({
                            user_id: campaign.user_id,
                            title: 'Campaign Goal Reached!',
                            message: `Your campaign "${campaign.title}" has reached its funding goal and has been closed.`,
                            type: 'campaign_success',
                            related_id: campaign_id
                        });
                } catch (notificationError) {
                    console.error(`[${transactionId}] Failed to send notification:`, notificationError);
                }
            }
        }

        res.status(201).json({
            success: true,
            message: willReachGoal
                ? 'Donation created successfully and campaign goal reached! Campaign is now closed.'
                : 'Donation created successfully',
            data: {
                ...donation,
                campaign_closed: willReachGoal,
                goal_reached: willReachGoal
            }
        });

    } catch (error: any) {
        console.error(`[${transactionId}] Error creating donation:`, error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create donation',
            transactionId
        });
    }
};

const getOverallTotals = async (req: Request, res: Response): Promise<any> => {
    try {
        // Get all donations
        const { data: allDonations, error: donationsError } = await supabase
            .from('campaign_donations')
            .select('amount, currency, payment_status');

        if (donationsError) {
            console.error('Error fetching donations:', donationsError);
            throw new Error('Failed to fetch donations data');
        }

        // Get all bids
        const { data: allBids, error: bidsError } = await supabase
            .from('campaign_bids')
            .select('amount, currency');

        if (bidsError) {
            console.error('Error fetching bids:', bidsError);
            throw new Error('Failed to fetch bids data');
        }

        // Calculate overall donation totals
        let totalDonationsAC = 0;
        let totalSuccessfulDonationsAC = 0;

        if (allDonations) {
            allDonations.forEach(donation => {
                const amountInAC = donation.currency === 'AC'
                    ? Number(donation.amount)
                    : Number(donation.amount) / 2;

                totalDonationsAC += amountInAC;

                if (donation.payment_status === 'success' || donation.payment_status === 'completed') {
                    totalSuccessfulDonationsAC += amountInAC;
                }
            });
        }

        // Calculate overall bid totals
        let totalBidsAC = 0;

        if (allBids) {
            allBids.forEach(bid => {
                const amountInAC = bid.currency === 'AC'
                    ? Number(bid.amount)
                    : Number(bid.amount) / 2;

                totalBidsAC += amountInAC;
            });
        }

        // Overall totals (donations + bids)
        const overallTotalAC = totalDonationsAC + totalBidsAC;

        res.status(200).json({
            success: true,
            data: {
                donations: {
                    total_ac: parseFloat(totalDonationsAC.toFixed(2)),
                    successful_total_ac: parseFloat(totalSuccessfulDonationsAC.toFixed(2)),
                    currency: 'AC',
                    count: allDonations?.length || 0
                },
                bids: {
                    total_ac: parseFloat(totalBidsAC.toFixed(2)),
                    currency: 'AC',
                    count: allBids?.length || 0
                },
                overall: {
                    total_ac: parseFloat(overallTotalAC.toFixed(2)),
                    currency: 'AC',
                    total_transactions: (allDonations?.length || 0) + (allBids?.length || 0)
                }
            }
        });

    } catch (error: any) {
        console.error('Error getting overall totals:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get overall totals'
        });
    }
};

const claimDonations = async (req: Request, res: Response): Promise<any> => {
    try {
        const campaignId = req.params.id;
        const userId = req.user?.id!;

        if (!campaignId) {
            return res.status(400).json({ success: false, message: 'Campaign ID is required' });
        }

        const { data: campaign, error: campaignError } = await supabase
            .from('hope_campaigns')
            .select('*')
            .eq('id', campaignId)
            .single();

        if (campaignError || !campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        if (campaign.status !== 'closed') {
            return res.status(400).json({ success: false, message: 'Campaign is not closed' });
        }

        if (campaign.user_id !== userId) {
            return res.status(403).json({ success: false, message: 'Only campaign creator can claim funds' });
        }

        if (campaign.is_claimed || campaign.claimed_at) {
            return res.status(400).json({ success: false, message: 'Funds already claimed' });
        }

        let finalAcAmount = 0;

        if (campaign.campaign_type === 'auction_donation') {
            finalAcAmount = campaign.highest_bid || 0;

            // 🔹 Refund other bidders
            const { data: allBids, error: bidsError } = await supabase
                .from('campaign_bids')
                .select('id, bidder_id, amount, currency, is_refunded')
                .eq('campaign_id', campaignId);

            if (bidsError) throw bidsError;

            if (allBids && allBids.length > 0) {
                for (const bid of allBids) {
                    if (bid.amount === campaign.highest_bid) {
                        // skip the highest bidder (the winner)
                        continue;
                    }

                    if (bid.is_refunded) {
                        continue; // already refunded
                    }

                    const refundAmountAC = bid.currency === 'AC'
                        ? Number(bid.amount)
                        : Number(bid.amount) / 2;

                    if (refundAmountAC > 0) {
                        // Update bidder's anamcoins wallet
                        const { data: bidderCoins } = await supabase
                            .from('anamcoins')
                            .select('*')
                            .eq('user_id', bid.bidder_id)
                            .single();

                        if (bidderCoins) {
                            await supabase
                                .from('anamcoins')
                                .update({
                                    total_coins: bidderCoins.total_coins + refundAmountAC,
                                    available_coins: bidderCoins.available_coins + refundAmountAC,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('user_id', bid.bidder_id);
                        } else {
                            await supabase
                                .from('anamcoins')
                                .insert({
                                    user_id: bid.bidder_id,
                                    total_coins: refundAmountAC,
                                    available_coins: refundAmountAC,
                                    spent_coins: 0,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString()
                                });
                        }

                        // mark bid as refunded
                        await supabase
                            .from('campaign_bids')
                            .update({ is_refunded: true })
                            .eq('id', bid.id);
                    }
                }
            }
        } else {
            const totalAcAmount = campaign.total_donations_ac || 0;
            const totalAbAmount = campaign.total_donations_ab || 0;
            finalAcAmount = totalAcAmount + (totalAbAmount / 2);
        }

        if (finalAcAmount <= 0) {
            return res.status(400).json({ success: false, message: 'No funds to claim' });
        }

        // 🔹 Credit campaign owner with final amount
        const { data: coins, error: coinsError } = await supabase
            .from('anamcoins')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (coins) {
            const { error: updateError } = await supabase
                .from('anamcoins')
                .update({
                    total_coins: coins.total_coins + finalAcAmount,
                    available_coins: coins.available_coins + finalAcAmount,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await supabase
                .from('anamcoins')
                .insert({
                    user_id: userId,
                    total_coins: finalAcAmount,
                    available_coins: finalAcAmount,
                    spent_coins: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (insertError) throw insertError;
        }

        // 🔹 Mark campaign as claimed
        const { error: updateCampaignError } = await supabase
            .from('hope_campaigns')
            .update({
                claimed_at: new Date().toISOString(),
                is_claimed: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', campaignId);

        if (updateCampaignError) throw updateCampaignError;

        res.status(200).json({
            success: true,
            message: 'Funds claimed successfully',
            amount: finalAcAmount,
            currency: 'AC'
        });

    } catch (error) {
        console.error('Error claiming funds:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// const claimDonations = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const campaignId = req.params.id;
//         const userId = req.user?.id!;

//         if (!campaignId) {
//             return res.status(400).json({ success: false, message: 'Campaign ID is required' });
//         }

//         const { data: campaign, error: campaignError } = await supabase
//             .from('hope_campaigns')
//             .select('*')
//             .eq('id', campaignId)
//             .single();

//         if (campaignError || !campaign) {
//             return res.status(404).json({ success: false, message: 'Campaign not found' });
//         }

//         if (campaign.status !== 'closed') {
//             return res.status(400).json({ success: false, message: 'Campaign is not closed' });
//         }

//         if (campaign.user_id !== userId) {
//             return res.status(403).json({ success: false, message: 'Only campaign creator can claim funds' });
//         }

//         if (campaign.is_claimed || campaign.claimed_at) {
//             return res.status(400).json({ success: false, message: 'Funds already claimed' });
//         }

//         let finalAcAmount = 0;

//         if (campaign.campaign_type === 'auction_donation') {
//             finalAcAmount = campaign.highest_bid || 0;
//         } else {
//             const totalAcAmount = campaign.total_donations_ac || 0;
//             const totalAbAmount = campaign.total_donations_ab || 0;
//             finalAcAmount = totalAcAmount + (totalAbAmount / 2);
//         }

//         if (finalAcAmount <= 0) {
//             return res.status(400).json({ success: false, message: 'No funds to claim' });
//         }

//         const { data: coins, error: coinsError } = await supabase
//             .from('anamcoins')
//             .select('*')
//             .eq('user_id', userId)
//             .single();

//         if (coins) {
//             const { error: updateError } = await supabase
//                 .from('anamcoins')
//                 .update({
//                     total_coins: coins.total_coins + finalAcAmount,
//                     available_coins: coins.available_coins + finalAcAmount,
//                     updated_at: new Date().toISOString()
//                 })
//                 .eq('user_id', userId);

//             if (updateError) {
//                 throw updateError;
//             }
//         } else {
//             const { error: insertError } = await supabase
//                 .from('anamcoins')
//                 .insert({
//                     user_id: userId,
//                     total_coins: finalAcAmount,
//                     available_coins: finalAcAmount,
//                     spent_coins: 0,
//                     created_at: new Date().toISOString(),
//                     updated_at: new Date().toISOString()
//                 });

//             if (insertError) {
//                 throw insertError;
//             }
//         }

//         const { error: updateCampaignError } = await supabase
//             .from('hope_campaigns')
//             .update({
//                 claimed_at: new Date().toISOString(),
//                 is_claimed: true,
//                 updated_at: new Date().toISOString()
//             })
//             .eq('id', campaignId);

//         if (updateCampaignError) {
//             throw updateCampaignError;
//         }

//         res.status(200).json({
//             success: true,
//             message: 'Funds claimed successfully',
//             amount: finalAcAmount,
//             currency: 'AC'
//         });

//     } catch (error) {
//         console.error('Error claiming funds:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Internal server error'
//         });
//     }
// }


// -------------- Product boost or promotion--------------
export const createBoost = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id!;
        const { campaign_id, boost_type, boost_percentage, boost_duration, boost_cost } = req.body;

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Use Supabase's transaction capability
        const { data: result, error: transactionError } = await supabase.rpc('create_campaign_boost_transaction', {
            p_user_id: userId,
            p_campaign_id: campaign_id,
            p_boost_type: boost_type,
            p_boost_percentage: boost_percentage,
            p_boost_duration: boost_duration,
            p_boost_cost: boost_cost
        });

        if (transactionError) {
            return res.status(500).json({ error: 'Failed to create boost: ' + transactionError.message });
        }

        if (result && result.error) {
            const statusCode = result.error.includes('Insufficient') ? 400 : 404;
            return res.status(statusCode).json({ error: result.error });
        }

        res.status(201).json({
            success: true,
            message: 'Boost created successfully',
            data: result
        });
    } catch (error: any) {
        console.error('Error creating boost:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

export const getActiveBoosts = async (req: Request, res: Response): Promise<any> => {
    try {
        const { campaign_id } = req.params;

        const { data: boosts, error } = await supabase
            .rpc('get_active_boosts', { campaign_id: campaign_id });

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch boosts' });
        }

        res.json({ boosts });
    } catch (error) {
        console.error('Error fetching boosts:', error);
        res.status(500).json({ error: 'Internal server error' });
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
    getAllCampaigns,
    getBoostedCampaigns,

    // donations and bidding
    getCampaignBids,
    getCampaignDonations,
    createBid,
    createDonation,
    getOverallTotals,
    claimDonations
};