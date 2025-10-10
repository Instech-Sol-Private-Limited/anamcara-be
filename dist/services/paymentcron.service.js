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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPendingPayments = exports.setupPaymentCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const app_1 = require("../app");
// Run daily at 2 AM
const setupPaymentCron = () => {
    node_cron_1.default.schedule('0 2 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            yield (0, exports.processPendingPayments)();
        }
        catch (error) {
            console.error('Error in payment cron job:', error);
        }
    }));
};
exports.setupPaymentCron = setupPaymentCron;
const processPendingPayments = () => __awaiter(void 0, void 0, void 0, function* () {
    const today = new Date().toISOString();
    const BATCH_SIZE = 50;
    let processedCount = 0;
    let hasMore = true;
    while (hasMore) {
        const { data: payments, error } = yield app_1.supabase
            .from('pending_payments')
            .select('*')
            .lte('payout_date', today)
            .eq('status', 'pending')
            .order('payout_date', { ascending: true })
            .range(processedCount, processedCount + BATCH_SIZE - 1);
        if (error)
            throw error;
        if (!payments || payments.length === 0) {
            hasMore = false;
            continue;
        }
        yield Promise.all(payments.map((payment) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                yield app_1.supabase
                    .from('pending_payments')
                    .update({ status: 'processing' })
                    .eq('id', payment.id);
                const { data: sellerCoins, error: fetchError } = yield app_1.supabase
                    .from('anamcoins')
                    .select('available_coins, earned_coins')
                    .eq('user_id', payment.seller_id)
                    .single();
                if (fetchError || !sellerCoins)
                    throw fetchError || new Error('Seller coins record not found');
                // Transfer amount to seller (no buyer deduction needed)
                const { error: transferError } = yield app_1.supabase
                    .from('anamcoins')
                    .update({
                    available_coins: sellerCoins.available_coins + payment.amount,
                    earned_coins: sellerCoins.earned_coins + payment.amount,
                    updated_at: new Date().toISOString()
                })
                    .eq('user_id', payment.seller_id);
                if (transferError)
                    throw transferError;
                // Mark payment as completed
                yield app_1.supabase
                    .from('pending_payments')
                    .update({
                    status: 'completed',
                    updated_at: new Date().toISOString()
                })
                    .eq('id', payment.id);
            }
            catch (err) {
                console.error(`Failed to process payment ${payment.id}:`, err);
                yield app_1.supabase
                    .from('pending_payments')
                    .update({
                    status: 'failed',
                    error_message: err instanceof Error ? err.message : 'Unknown error',
                    updated_at: new Date().toISOString()
                })
                    .eq('id', payment.id);
            }
        })));
        processedCount += payments.length;
    }
});
exports.processPendingPayments = processPendingPayments;
