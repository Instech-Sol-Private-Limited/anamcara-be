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
exports.recordSoulPointsHistory = exports.recordAnamCoinsHistory = exports.processAccessBonusTransaction = exports.processAnamCoinsTransaction = void 0;
const app_1 = require("../app");
const recordAnamCoinsHistory = (params) => __awaiter(void 0, void 0, void 0, function* () {
    yield app_1.supabase
        .from('anamcoins_history')
        .insert({
        user_id: params.userId,
        coins_eamed: params.coinsEarned || 0,
        coins_spent: params.coinsSpent || 0,
        transaction_type: params.transactionType,
        description: params.description,
        soulpoints_used: params.soulpointsUsed || 0
    });
});
exports.recordAnamCoinsHistory = recordAnamCoinsHistory;
const recordSoulPointsHistory = (params) => __awaiter(void 0, void 0, void 0, function* () {
    yield app_1.supabase
        .from('soulpoints_history')
        .insert({
        user_id: params.userId,
        action: params.action,
        points_earned: params.pointsEarned || 0,
        description: params.description
    });
});
exports.recordSoulPointsHistory = recordSoulPointsHistory;
const processAnamCoinsTransaction = (userId, amount) => __awaiter(void 0, void 0, void 0, function* () {
    // Start transaction
    const { data: anamCoins, error: fetchError } = yield app_1.supabase
        .from('anamcoins')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (fetchError || !anamCoins) {
        throw new Error((fetchError === null || fetchError === void 0 ? void 0 : fetchError.message) || 'Anam Coins account not found');
    }
    if (anamCoins.available_coins < amount) {
        throw new Error('Insufficient Anam Coins balance');
    }
    // Update Anam Coins balance
    const { error: updateError } = yield app_1.supabase
        .from('anamcoins')
        .update({
        available_coins: anamCoins.available_coins - amount,
        spent_coins: anamCoins.spent_coins + amount,
        updated_at: new Date().toISOString()
    })
        .eq('user_id', userId);
    if (updateError) {
        throw new Error(updateError.message);
    }
});
exports.processAnamCoinsTransaction = processAnamCoinsTransaction;
const processAccessBonusTransaction = (userId, spAmount) => __awaiter(void 0, void 0, void 0, function* () {
    // Start transaction
    const { data: soulPoints, error: fetchError } = yield app_1.supabase
        .from('soulpoints')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (fetchError || !soulPoints) {
        throw new Error((fetchError === null || fetchError === void 0 ? void 0 : fetchError.message) || 'Soul Points account not found');
    }
    if (soulPoints.points < spAmount) {
        throw new Error('Insufficient Soul Points balance');
    }
    // Update Soul Points balance
    const { error: updateError } = yield app_1.supabase
        .from('soulpoints')
        .update({
        points: soulPoints.points - spAmount,
        updated_at: new Date().toISOString()
    })
        .eq('user_id', userId);
    if (updateError) {
        throw new Error(updateError.message);
    }
});
exports.processAccessBonusTransaction = processAccessBonusTransaction;
