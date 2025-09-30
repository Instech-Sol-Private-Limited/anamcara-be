"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferProductToWinner = void 0;
const app_1 = require("../app");
const transferProductToWinner = (campaignId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: campaign, error: campaignError } = yield app_1.supabase
            .from('hope_campaigns')
            .select('id, current_winner_id, offer_product_id')
            .eq('id', campaignId)
            .single();
        if (campaignError || !campaign) {
            console.error('Campaign not found for product transfer:', campaignId);
            return;
        }
        if (!campaign.current_winner_id || !campaign.offer_product_id) {
            console.log('No winner or product to transfer for campaign:', campaignId);
            return;
        }
        const { data: product, error: productError } = yield app_1.supabase
            .from('products')
            .select('id, title, license')
            .eq('id', campaign.offer_product_id)
            .single();
        if (productError || !product) {
            console.error('Product not found:', campaign.offer_product_id);
            return;
        }
        const { error: libraryError } = yield app_1.supabase
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
        console.log(`Product ${product.title} transferred to winner ${campaign.current_winner_id} for campaign ${campaignId}`);
    }
    catch (error) {
        console.error('Error in transferProductToWinner:', error);
    }
});
exports.transferProductToWinner = transferProductToWinner;
