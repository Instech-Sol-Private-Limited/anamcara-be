import { supabase } from "../app";

interface SoulPointsHistoryParams {
    userId: string;
    pointsEarned?: number;
    pointsSpent?: number;
    action: string;
    description: string;
}

interface AnamCoinsHistoryParams {
    userId: string;
    coinsEarned?: number;
    coinsSpent?: number;
    transactionType: string;
    description: string;
    soulpointsUsed?: number;
}

const recordAnamCoinsHistory = async (params: AnamCoinsHistoryParams) => {
    await supabase
        .from('anamcoins_history')
        .insert({
            user_id: params.userId,
            coins_eamed: params.coinsEarned || 0,
            coins_spent: params.coinsSpent || 0,
            transaction_type: params.transactionType,
            description: params.description,
            soulpoints_used: params.soulpointsUsed || 0
        });
};

const recordSoulPointsHistory = async (params: SoulPointsHistoryParams) => {
    await supabase
        .from('soulpoints_history')
        .insert({
            user_id: params.userId,
            action: params.action,
            points_earned: params.pointsEarned || 0,
            description: params.description
        });
};

const processAnamCoinsTransaction = async (userId: string, amount: number): Promise<void> => {
    // Start transaction
    const { data: anamCoins, error: fetchError } = await supabase
        .from('anamcoins')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (fetchError || !anamCoins) {
        throw new Error(fetchError?.message || 'Anam Coins account not found');
    }

    if (anamCoins.available_coins < amount) {
        throw new Error('Insufficient Anam Coins balance');
    }

    // Update Anam Coins balance
    const { error: updateError } = await supabase
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
};

const processAccessBonusTransaction = async (userId: string, spAmount: number): Promise<void> => {
    // Start transaction
    const { data: soulPoints, error: fetchError } = await supabase
        .from('soulpoints')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (fetchError || !soulPoints) {
        throw new Error(fetchError?.message || 'Soul Points account not found');
    }

    if (soulPoints.points < spAmount) {
        throw new Error('Insufficient Soul Points balance');
    }

    // Update Soul Points balance
    const { error: updateError } = await supabase
        .from('soulpoints')
        .update({
            points: soulPoints.points - spAmount,
            updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

    if (updateError) {
        throw new Error(updateError.message);
    }
};

export {
    processAnamCoinsTransaction,
    processAccessBonusTransaction,
    recordAnamCoinsHistory,
    recordSoulPointsHistory,
}