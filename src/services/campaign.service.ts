import { supabase } from "../app";

const transferProductToWinner = async (campaignId: string): Promise<void> => {
    try {
        const { data: campaign, error: campaignError } = await supabase
            .from('hope_campaigns')
            .select('id, current_winner_id, offer_product_id')
            .eq('id', campaignId)
            .single();

        if (campaignError || !campaign) {
            console.error('Campaign not found for product transfer:', campaignId);
            return;
        }

        if (!campaign.current_winner_id || !campaign.offer_product_id) {
            return;
        }

        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id, title, license')
            .eq('id', campaign.offer_product_id)
            .single();

        if (productError || !product) {
            console.error('Product not found:', campaign.offer_product_id);
            return;
        }

        const { error: libraryError } = await supabase
            .from('my_library')
            .insert({
                user_id: campaign.current_winner_id,
                product_id: campaign.offer_product_id,
                license_type: 'personal',
                is_resold: false,
            });

        if (libraryError) {
            console.error('Failed to add product to user library:', libraryError);
            return;
        }

    } catch (error: any) {
        console.error('Error in transferProductToWinner:', error);
    }
};

export {
    transferProductToWinner
}