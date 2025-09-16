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
exports.onboardingretrun = exports.accountdashboarduserid = exports.historyid = exports.WithDraw = exports.checkaccountstatususerId = exports.setupwithdrawalaccount = exports.redeem = exports.historyuserid = exports.userid = exports.sessionuserid = exports.balanceuserid = exports.transactionuserid = exports.processsuccess = exports.createCheckoutSession = void 0;
const app_1 = require("../app");
const stripe_1 = __importDefault(require("stripe"));
if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is missing in environment variables");
}
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY);
//========================Exchange==========================================//
const createCheckoutSession = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { amount, fromCurrency, toCurrency, metadata } = req.body;
        console.log('🔄 Creating checkout session:', { amount, fromCurrency, toCurrency, userId: metadata === null || metadata === void 0 ? void 0 : metadata.userId });
        if (!amount || amount <= 0) {
            res.status(400).json({ error: "Invalid amount" });
            return;
        }
        if (!(metadata === null || metadata === void 0 ? void 0 : metadata.userId)) {
            res.status(400).json({ error: "User ID is required" });
            return;
        }
        const exchangeRate = (metadata === null || metadata === void 0 ? void 0 : metadata.conversionRate) || "1";
        const convertedAmount = parseFloat(amount) * parseFloat(exchangeRate) * (1 - 0.11);
        const sessionMetadata = {
            userId: metadata.userId,
            fromCurrency,
            toCurrency,
            originalAmount: amount.toString(),
            convertedAmount: convertedAmount.toString(),
            conversionRate: exchangeRate,
            exchangeType: "currency_exchange",
            timestamp: new Date().toISOString(),
            userEmail: (metadata === null || metadata === void 0 ? void 0 : metadata.userEmail) || "",
            userName: (metadata === null || metadata === void 0 ? void 0 : metadata.userName) || "",
        };
        const session = yield stripe.checkout.sessions.create(Object.assign({ payment_method_types: ["card"], line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `Currency Exchange: ${fromCurrency} → ${toCurrency}`,
                            description: `Exchange ${amount} ${fromCurrency} to ${convertedAmount.toFixed(2)} ${toCurrency}`,
                        },
                        unit_amount: Math.round(parseFloat(amount) * 100),
                    },
                    quantity: 1,
                },
            ], mode: "payment", success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/user/vault?tab=vault&session_id={CHECKOUT_SESSION_ID}&success=true`, cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/user/vault?tab=vault&cancelled=true`, metadata: sessionMetadata, expires_at: Math.floor(Date.now() / 1000) + (30 * 60) }, ((metadata === null || metadata === void 0 ? void 0 : metadata.userEmail) && { customer_email: metadata.userEmail })));
        console.log('✅ Checkout session created:', session.id);
        res.json({ url: session.url, sessionId: session.id });
    }
    catch (error) {
        console.error("❌ Stripe error:", error);
        res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
});
exports.createCheckoutSession = createCheckoutSession;
const processsuccess = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { sessionId } = req.body;
        console.log('🔄 Processing success for session:', sessionId);
        if (!sessionId) {
            res.status(400).json({ error: "Session ID required" });
            return;
        }
        // Retrieve session from Stripe
        const session = yield stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent']
        });
        console.log('📡 Session retrieved:', {
            id: session.id,
            payment_status: session.payment_status,
            metadata: session.metadata
        });
        if (session.payment_status !== 'paid') {
            res.status(400).json({ error: "Payment not completed" });
            return;
        }
        const metadata = session.metadata;
        if (!metadata) {
            res.status(400).json({ error: "Session metadata not found" });
            return;
        }
        // Extract metadata with proper null checks and defaults
        const userId = metadata['userId'] || 'anonymous';
        const fromCurrency = metadata['fromCurrency'] || 'USD';
        const toCurrency = metadata['toCurrency'] || 'AC';
        const originalAmount = parseFloat(metadata['originalAmount'] || '0');
        const convertedAmount = parseFloat(metadata['convertedAmount'] || '0');
        const conversionRate = parseFloat(metadata['conversionRate'] || '1');
        console.log('💰 Transaction details:', {
            userId,
            fromCurrency,
            toCurrency,
            originalAmount,
            convertedAmount,
            conversionRate
        });
        // Check if transaction already exists to prevent duplicates
        const { data: existingTransaction, error: checkError } = yield app_1.supabase
            .from('exchange_transactions')
            .select('*')
            .eq('transaction_id', sessionId)
            .single();
        if (existingTransaction) {
            console.log('✅ Transaction already processed:', sessionId);
            res.json({
                success: true,
                transaction: existingTransaction,
                sessionDetails: {
                    id: session.id,
                    payment_status: session.payment_status,
                    amount_total: session.amount_total,
                    metadata: session.metadata
                }
            });
            return;
        }
        // Save transaction to exchange_transactions table
        const transactionData = {
            transaction_id: sessionId,
            user_id: userId,
            from_currency: fromCurrency,
            to_currency: toCurrency,
            original_amount: originalAmount,
            converted_amount: convertedAmount,
            conversion_rate: conversionRate,
            stripe_amount: session.amount_total || 0,
            payment_status: session.payment_status,
            created_at: new Date(session.created * 1000).toISOString(),
            metadata: metadata
        };
        console.log('💾 Saving transaction data:', transactionData);
        const { data: transaction, error: transactionError } = yield app_1.supabase
            .from('exchange_transactions')
            .insert([transactionData])
            .select()
            .single();
        if (transactionError) {
            console.error('❌ Error saving transaction:', transactionError);
            res.status(500).json({ error: 'Failed to save transaction', details: transactionError.message });
            return;
        }
        console.log('✅ Transaction saved to database:', transaction.transaction_id);
        // FIXED: Enhanced AnamCoins system update for AC conversion
        if (toCurrency === 'AC') {
            console.log('🪙 Processing AnamCoins update...');
            try {
                // First, check if user already has AnamCoins record
                const { data: existingAnamCoins, error: fetchError } = yield app_1.supabase
                    .from('anamcoins')
                    .select('*')
                    .eq('user_id', userId)
                    .maybeSingle(); // Use maybeSingle() instead of single() to avoid error if no record exists
                console.log('🔍 Existing AnamCoins:', existingAnamCoins, 'Error:', fetchError);
                if (existingAnamCoins) {
                    // Update existing AnamCoins record
                    const newTotalCoins = (existingAnamCoins.total_coins || 0) + convertedAmount;
                    const newAvailableCoins = (existingAnamCoins.available_coins || 0) + convertedAmount;
                    console.log('📈 Updating AnamCoins:', {
                        oldTotal: existingAnamCoins.total_coins,
                        oldAvailable: existingAnamCoins.available_coins,
                        adding: convertedAmount,
                        newTotal: newTotalCoins,
                        newAvailable: newAvailableCoins
                    });
                    const { data: updatedAnamCoins, error: updateError } = yield app_1.supabase
                        .from('anamcoins')
                        .update({
                        total_coins: newTotalCoins,
                        available_coins: newAvailableCoins,
                        updated_at: new Date().toISOString()
                    })
                        .eq('user_id', userId)
                        .select()
                        .single();
                    if (updateError) {
                        console.error('❌ Error updating AnamCoins:', updateError);
                    }
                    else {
                        console.log(`✅ Updated AnamCoins for user ${userId}:`, updatedAnamCoins);
                    }
                }
                else {
                    // Create new AnamCoins record
                    console.log('🆕 Creating new AnamCoins record...');
                    const newAnamCoinsData = {
                        user_id: userId,
                        total_coins: convertedAmount,
                        available_coins: convertedAmount,
                        spent_coins: 0,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    console.log('📝 New AnamCoins data:', newAnamCoinsData);
                    const { data: newAnamCoins, error: insertError } = yield app_1.supabase
                        .from('anamcoins')
                        .insert([newAnamCoinsData])
                        .select()
                        .single();
                    if (insertError) {
                        console.error('❌ Error creating AnamCoins record:', insertError);
                    }
                    else {
                        console.log(`✅ Created new AnamCoins record for user ${userId}:`, newAnamCoins);
                    }
                }
                // Add transaction to AnamCoins history
                console.log('📝 Adding AnamCoins history...');
                const historyData = {
                    user_id: userId,
                    transaction_type: 'earned',
                    coins_earned: convertedAmount,
                    coins_spent: 0,
                    description: `Earned ${convertedAmount} AnamCoins from USD to AC exchange (Transaction: ${sessionId})`,
                    created_at: new Date().toISOString()
                };
                const { data: historyRecord, error: historyError } = yield app_1.supabase
                    .from('anamcoins_history')
                    .insert(historyData)
                    .select()
                    .single();
                if (historyError) {
                    console.error('❌ Error adding AnamCoins history:', historyError);
                }
                else {
                    console.log('✅ AnamCoins history added:', historyRecord);
                }
            }
            catch (anamCoinsError) {
                console.error('❌ Error in AnamCoins processing:', anamCoinsError);
            }
        }
        else {
            // Update user_balances for non-AC currencies
            console.log('💰 Updating user balance for:', toCurrency);
            const { data: existingBalance } = yield app_1.supabase
                .from('user_balances')
                .select('amount')
                .eq('user_id', userId)
                .eq('currency_type', toCurrency)
                .maybeSingle();
            const newAmount = ((existingBalance === null || existingBalance === void 0 ? void 0 : existingBalance.amount) || 0) + convertedAmount;
            yield app_1.supabase.from('user_balances')
                .upsert({
                user_id: userId,
                currency_type: toCurrency,
                amount: newAmount,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,currency_type' });
        }
        console.log('🎉 Payment processing completed successfully');
        res.json({
            success: true,
            transaction,
            sessionDetails: {
                id: session.id,
                payment_status: session.payment_status,
                amount_total: session.amount_total,
                metadata: session.metadata
            }
        });
    }
    catch (error) {
        console.error("❌ Error processing successful payment:", error);
        res.status(500).json({
            error: error.message,
            success: false
        });
    }
});
exports.processsuccess = processsuccess;
const transactionuserid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query; // Increased default limit to match frontend
        console.log('🔄 Fetching transactions for user:', userId);
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const { data: transactions, error, count } = yield app_1.supabase
            .from('exchange_transactions')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);
        if (error) {
            console.error('❌ Error fetching transactions:', error);
            res.status(500).json({ error: 'Failed to fetch transactions', details: error.message });
            return;
        }
        console.log('📊 Raw transactions from DB:', (transactions === null || transactions === void 0 ? void 0 : transactions.length) || 0, 'items');
        // Format transactions for frontend - FIXED to match expected structure
        const formattedTransactions = (transactions || []).map((tx, index) => {
            console.log(`📋 Formatting transaction ${index + 1}:`, {
                id: tx.transaction_id,
                from: tx.from_currency,
                to: tx.to_currency,
                original_amount: tx.original_amount,
                converted_amount: tx.converted_amount,
                status: tx.payment_status
            });
            return {
                id: tx.transaction_id, // Use transaction_id as id
                transaction_id: tx.transaction_id,
                date: new Date(tx.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                type: 'Exchange',
                description: `Exchanged ${tx.original_amount} ${tx.from_currency} → ${tx.converted_amount.toFixed(2)} ${tx.to_currency}`,
                amount: `+${tx.converted_amount.toFixed(2)} ${tx.to_currency}`,
                fromCurrency: tx.from_currency,
                toCurrency: tx.to_currency,
                fromAmount: tx.original_amount,
                toAmount: tx.converted_amount,
                status: tx.payment_status === 'paid' ? 'completed' : (tx.payment_status || 'pending'),
                created_at: tx.created_at
            };
        });
        console.log('✅ Formatted transactions:', formattedTransactions.length, 'items');
        const response = {
            transactions: formattedTransactions,
            total: count || 0,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil((count || 0) / parseInt(limit))
        };
        console.log('📤 Sending response:', {
            transactionCount: response.transactions.length,
            total: response.total,
            page: response.page
        });
        res.json(response);
    }
    catch (error) {
        console.error("❌ Error fetching transaction history:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.transactionuserid = transactionuserid;
const balanceuserid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        console.log('🔄 Fetching balances for user:', userId);
        // Get AnamCoins data - FIXED to handle both cases properly
        const { data: anamCoinsData, error: acError } = yield app_1.supabase
            .from('anamcoins')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle(); // Use maybeSingle to avoid error if no record
        console.log('🪙 AnamCoins query result:', { data: anamCoinsData, error: acError });
        // Get other currency balances
        const { data: balances, error: balanceError } = yield app_1.supabase
            .from('user_balances')
            .select('*')
            .eq('user_id', userId);
        console.log('💰 User balances query result:', { data: balances, error: balanceError });
        if (balanceError) {
            console.error('❌ Error fetching balances:', balanceError);
            res.status(500).json({ error: 'Failed to fetch balances' });
            return;
        }
        // Convert to a more usable format
        const balanceMap = (balances || []).reduce((acc, balance) => {
            acc[balance.currency_type] = balance.amount;
            return acc;
        }, {});
        // Add AnamCoins data if available
        if (anamCoinsData && !acError) {
            balanceMap['AC'] = anamCoinsData.available_coins || 0;
        }
        else {
            balanceMap['AC'] = 0; // Default to 0 if no AnamCoins record
        }
        const responseData = {
            balances: balanceMap,
            details: balances || [],
            anamcoins: anamCoinsData || {
                total_coins: 0,
                available_coins: 0,
                spent_coins: 0
            }
        };
        console.log('✅ Sending balance response:', responseData);
        res.json(responseData);
    }
    catch (error) {
        console.error("❌ Error fetching balances:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.balanceuserid = balanceuserid;
const sessionuserid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sessionId = req.params.id;
        console.log('🔄 Retrieving session:', sessionId);
        const session = yield stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent', 'customer']
        });
        const sessionDetails = {
            id: session.id,
            payment_status: session.payment_status,
            status: session.status,
            amount_total: session.amount_total,
            currency: session.currency,
            customer_email: session.customer_email,
            created: session.created,
            metadata: session.metadata,
            payment_intent: session.payment_intent,
            success_url: session.success_url,
            cancel_url: session.cancel_url
        };
        console.log("✅ Session retrieved:", {
            sessionId,
            paymentStatus: session.payment_status,
            metadata: session.metadata
        });
        res.json(sessionDetails);
    }
    catch (error) {
        console.error("❌ Error fetching session:", error);
        res.status(500).json({
            error: error.message,
            sessionId: req.params.id
        });
    }
});
exports.sessionuserid = sessionuserid;
const userid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        if (!userId) {
            res.status(400).json({ error: "User ID is required" });
            return;
        }
        // Fetch AnamCoins data for the user
        const { data: anamCoinsData, error } = yield app_1.supabase
            .from('anamcoins')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Error fetching AnamCoins:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch AnamCoins data',
                details: error.message
            });
            return;
        }
        // If no record exists, return default values
        if (!anamCoinsData) {
            res.json({
                success: true,
                data: {
                    user_id: userId,
                    total_coins: 0,
                    available_coins: 0,
                    spent_coins: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            });
            return;
        }
        res.json({
            success: true,
            data: anamCoinsData
        });
    }
    catch (error) {
        console.error("Error fetching AnamCoins:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch AnamCoins data"
        });
    }
});
exports.userid = userid;
const historyuserid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const { limit = 20, offset = 0 } = req.query;
        if (!userId) {
            res.status(400).json({ error: "User ID is required" });
            return;
        }
        const { data: historyData, error } = yield app_1.supabase
            .from('anamcoins_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
        if (error) {
            console.error('Error fetching AnamCoins history:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch AnamCoins history',
                details: error.message
            });
            return;
        }
        res.json({
            success: true,
            data: historyData || []
        });
    }
    catch (error) {
        console.error("Error fetching AnamCoins history:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch AnamCoins history"
        });
    }
});
exports.historyuserid = historyuserid;
const redeem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, soulPointsAmount } = req.body;
        if (!userId || !soulPointsAmount || soulPointsAmount < 100) {
            res.status(400).json({
                success: false,
                error: "Invalid request. User ID and minimum 100 SoulPoints required."
            });
            return;
        }
        // Calculate AnamCoins to award (100 SP = 5 AC)
        const anamCoinsToAward = Math.floor(soulPointsAmount / 100) * 5;
        const actualSoulPointsUsed = Math.floor(soulPointsAmount / 100) * 100;
        // Start a transaction-like operation
        // First, check current SoulPoints
        const { data: currentSoulPoints, error: spError } = yield app_1.supabase
            .from('soulpoints')
            .select('points')
            .eq('user_id', userId)
            .single();
        if (spError || !currentSoulPoints || currentSoulPoints.points < actualSoulPointsUsed) {
            res.status(400).json({
                success: false,
                error: "Insufficient SoulPoints for redemption"
            });
            return;
        }
        // Deduct SoulPoints
        const { error: deductError } = yield app_1.supabase
            .from('soulpoints')
            .update({
            points: currentSoulPoints.points - actualSoulPointsUsed,
            updated_at: new Date().toISOString()
        })
            .eq('user_id', userId);
        if (deductError) {
            console.error('Error deducting SoulPoints:', deductError);
            res.status(500).json({
                success: false,
                error: "Failed to deduct SoulPoints"
            });
            return;
        }
        // Update or create AnamCoins record
        const { data: existingAnamCoins, error: fetchError } = yield app_1.supabase
            .from('anamcoins')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (existingAnamCoins) {
            // Update existing record
            const { error: updateError } = yield app_1.supabase
                .from('anamcoins')
                .update({
                total_coins: existingAnamCoins.total_coins + anamCoinsToAward,
                available_coins: existingAnamCoins.available_coins + anamCoinsToAward,
                updated_at: new Date().toISOString()
            })
                .eq('user_id', userId);
            if (updateError) {
                console.error('Error updating AnamCoins:', updateError);
                res.status(500).json({
                    success: false,
                    error: "Failed to update AnamCoins"
                });
                return;
            }
        }
        else {
            // Create new record
            const { error: insertError } = yield app_1.supabase
                .from('anamcoins')
                .insert({
                user_id: userId,
                total_coins: anamCoinsToAward,
                available_coins: anamCoinsToAward,
                spent_coins: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            if (insertError) {
                console.error('Error creating AnamCoins record:', insertError);
                res.status(500).json({
                    success: false,
                    error: "Failed to create AnamCoins record"
                });
                return;
            }
        }
        // Add to AnamCoins history
        const { error: historyError } = yield app_1.supabase
            .from('anamcoins_history')
            .insert({
            user_id: userId,
            transaction_type: 'redeemed',
            coins_earned: anamCoinsToAward,
            coins_spent: 0,
            description: `Redeemed ${actualSoulPointsUsed} SoulPoints for ${anamCoinsToAward} AnamCoins`,
            created_at: new Date().toISOString()
        });
        if (historyError) {
            console.error('Error adding AnamCoins history:', historyError);
            // Don't fail the request for history error
        }
        res.json({
            success: true,
            message: `Successfully redeemed ${actualSoulPointsUsed} SoulPoints for ${anamCoinsToAward} AnamCoins`,
            data: {
                coinsEarned: anamCoinsToAward,
                soulpointsUsed: actualSoulPointsUsed
            }
        });
    }
    catch (error) {
        console.error("Error redeeming SoulPoints:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to redeem SoulPoints"
        });
    }
});
exports.redeem = redeem;
//=======================WithDrawal================//
const setupwithdrawalaccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, userEmail, userCountry = 'AE' } = req.body;
        // Check if user already has account
        const { data: existingAccount } = yield app_1.supabase
            .from('user_accounts')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (existingAccount === null || existingAccount === void 0 ? void 0 : existingAccount.account_ready) {
            res.json({ success: true, accountReady: true, message: "Withdrawal account already set up" });
            return;
        }
        // If account exists but not ready, create new onboarding link
        let accountId = existingAccount === null || existingAccount === void 0 ? void 0 : existingAccount.stripe_account_id;
        if (!accountId) {
            // Create Express account
            const account = yield stripe.accounts.create({
                type: 'standard',
                country: userCountry,
                email: userEmail,
            });
            accountId = account.id;
            // Save account info
            yield app_1.supabase.from('user_accounts').upsert({
                user_id: userId,
                stripe_account_id: account.id,
                account_ready: false,
                created_at: new Date().toISOString()
            });
        }
        // Create onboarding link with FIXED return URLs pointing to TextVault tab
        const accountLink = yield stripe.accountLinks.create({
            account: accountId,
            refresh_url: `${process.env.CLIENT_URL}/user/dashboard#vault`,
            return_url: `${process.env.CLIENT_URL}/user/dashboard?setup=complete&accountId=${accountId}#vault`,
            type: 'account_onboarding',
        });
        res.json({
            success: true,
            onboardingUrl: accountLink.url,
            accountId: accountId
        });
    }
    catch (error) {
        console.error("Account setup error:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.setupwithdrawalaccount = setupwithdrawalaccount;
const checkaccountstatususerId = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const { data: userAccount } = yield app_1.supabase
            .from('user_accounts')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (!userAccount) {
            res.json({ accountReady: false, needsSetup: true });
            return;
        }
        // Check with Stripe
        const account = yield stripe.accounts.retrieve(userAccount.stripe_account_id);
        const isReady = account.charges_enabled && account.payouts_enabled;
        // Update our database when account status changes
        if (isReady !== userAccount.account_ready) {
            yield app_1.supabase
                .from('user_accounts')
                .update({
                account_ready: isReady,
                updated_at: new Date().toISOString()
            })
                .eq('user_id', userId);
        }
        res.json({
            accountReady: isReady,
            needsSetup: !isReady,
            accountId: userAccount.stripe_account_id,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled
        });
    }
    catch (error) {
        console.error("Status check error:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.checkaccountstatususerId = checkaccountstatususerId;
const WithDraw = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, acAmount } = req.body;
        // Validate input
        if (!acAmount || acAmount < 10) {
            res.status(400).json({ error: "Minimum withdrawal: 10 AC" });
            return;
        }
        // Check user's account is ready
        const { data: userAccount } = yield app_1.supabase
            .from('user_accounts')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (!(userAccount === null || userAccount === void 0 ? void 0 : userAccount.account_ready)) {
            res.status(400).json({
                error: "Withdrawal account not set up. Please connect your bank account first.",
                needsSetup: true
            });
            return;
        }
        // Check AnamCoins balance from the correct table
        const { data: balance, error: balanceError } = yield app_1.supabase
            .from('anamcoins') // Make sure this table exists
            .select('total_coins')
            .eq('user_id', userId)
            .single();
        if (balanceError || !balance) {
            res.status(400).json({ error: "Unable to fetch balance" });
            return;
        }
        if (balance.total_coins < acAmount) {
            res.status(400).json({
                error: `Insufficient balance. You have ${balance.total_coins} AC, but need ${acAmount} AC`
            });
            return;
        }
        // Calculate amounts (100 AC = 89 USD after 11% tax)
        const grossUSD = acAmount * 1; // 1:1 rate
        const tax = grossUSD * 0.11; // 11% tax
        const netUSD = grossUSD - tax;
        const transferAmount = Math.floor(netUSD * 100); // Convert to cents
        if (transferAmount < 50) { // Stripe minimum $0.50
            res.status(400).json({ error: "Amount too small after tax deduction" });
            return;
        }
        // Create transfer to user's connected account
        const transfer = yield stripe.payouts.create({
            amount: transferAmount,
            currency: 'usd',
            destination: userAccount.stripe_account_id,
            description: `AnamCoins withdrawal: ${acAmount} AC → $${netUSD.toFixed(2)} USD`,
            metadata: {
                userId: userId,
                acAmount: acAmount.toString(),
                grossUSD: grossUSD.toString(),
                taxAmount: tax.toString(),
                netUSD: netUSD.toString()
            }
        });
        // Generate unique transaction ID
        const transactionId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // Save withdrawal record
        const { data: withdrawal, error: withdrawalError } = yield app_1.supabase
            .from('withdrawals')
            .insert({
            transaction_id: transactionId,
            user_id: userId,
            ac_amount: acAmount,
            gross_amount: grossUSD,
            tax_amount: tax,
            net_amount: netUSD,
            stripe_transfer_id: transfer.id,
            status: 'completed',
            created_at: new Date().toISOString()
        })
            .select()
            .single();
        if (withdrawalError) {
            // If withdrawal record fails, we should ideally reverse the transfer
            console.error("Failed to save withdrawal record:", withdrawalError);
            res.status(500).json({ error: "Failed to save withdrawal record" });
            return;
        }
        // DEDUCT AC from user's balance - CRITICAL STEP
        const { error: updateError } = yield app_1.supabase
            .from('anamcoins')
            .update({
            total_coins: balance.total_coins - acAmount,
            updated_at: new Date().toISOString()
        })
            .eq('user_id', userId);
        if (updateError) {
            console.error("Failed to update user balance:", updateError);
            // Note: In production, you'd want to handle this more carefully
            // possibly by reversing the Stripe transfer
        }
        res.json({
            success: true,
            withdrawal,
            transferId: transfer.id,
            message: `Successfully withdrawn ${acAmount} AC. $${netUSD.toFixed(2)} has been sent to your bank account.`,
            details: {
                acAmount,
                grossUSD,
                taxAmount: tax,
                netUSD,
                remainingBalance: balance.total_coins - acAmount
            }
        });
    }
    catch (error) {
        console.error("Withdrawal error:", error);
        // Provide more specific error messages
        if (error.type === 'StripeCardError') {
            res.status(400).json({ error: "Payment processing failed. Please check your account details." });
        }
        else if (error.type === 'StripeInvalidRequestError') {
            res.status(400).json({ error: "Invalid request. Please check your account setup." });
        }
        else {
            res.status(500).json({ error: `Withdrawal failed: ${error.message}` });
        }
    }
});
exports.WithDraw = WithDraw;
const historyid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        // Check if withdrawals table exists first
        const { data: tableCheck } = yield app_1.supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .eq('table_name', 'withdrawals')
            .single();
        if (!tableCheck) {
            // Return empty array if table doesn't exist yet
            res.json({
                success: true,
                withdrawals: [],
                count: 0,
                message: "Withdrawals table not yet created"
            });
            return;
        }
        const { data: withdrawals, error } = yield app_1.supabase
            .from('withdrawals')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(Number(offset), Number(offset) + Number(limit) - 1);
        if (error) {
            console.error("History fetch error:", error);
            // If table doesn't exist error, return empty array
            if (error.code === '42P01') {
                res.json({
                    success: true,
                    withdrawals: [],
                    count: 0,
                    message: "No withdrawals table found - please create the database schema"
                });
                return;
            }
            res.status(500).json({ error: "Failed to fetch withdrawal history" });
            return;
        }
        res.json({
            success: true,
            withdrawals: withdrawals || [],
            count: (withdrawals === null || withdrawals === void 0 ? void 0 : withdrawals.length) || 0
        });
    }
    catch (error) {
        console.error("History error:", error);
        // Handle table doesn't exist gracefully
        if (error.code === '42P01') {
            res.json({
                success: true,
                withdrawals: [],
                count: 0,
                message: "Withdrawals table not found - please run the database schema setup"
            });
            return;
        }
        res.status(500).json({ error: error.message });
    }
});
exports.historyid = historyid;
const accountdashboarduserid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const { data: userAccount } = yield app_1.supabase
            .from('user_accounts')
            .select('stripe_account_id, account_ready')
            .eq('user_id', userId)
            .single();
        if (!userAccount) {
            res.status(404).json({ error: "Account not found" });
            return;
        }
        if (!userAccount.account_ready) {
            res.status(400).json({ error: "Account not ready for dashboard access" });
            return;
        }
        const loginLink = yield stripe.accounts.createLoginLink(userAccount.stripe_account_id);
        res.json({
            dashboardUrl: loginLink.url
        });
    }
    catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.accountdashboarduserid = accountdashboarduserid;
const onboardingretrun = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { accountId } = req.query;
        if (!accountId) {
            res.redirect(`${process.env.CLIENT_URL}/user/dashboard#Vault`);
            return;
        }
        // Check account status and update database
        const account = yield stripe.accounts.retrieve(accountId);
        const isReady = account.charges_enabled && account.payouts_enabled;
        yield app_1.supabase
            .from('user_accounts')
            .update({
            account_ready: isReady,
            updated_at: new Date().toISOString()
        })
            .eq('stripe_account_id', accountId);
        // Redirect back to frontend with status
        res.redirect(`${process.env.CLIENT_URL}/user/dashboard?setup=complete&ready=${isReady}#vault`);
    }
    catch (error) {
        console.error("Onboarding return error:", error);
        res.redirect(`${process.env.CLIENT_URL}/user/dashboard?setup=error#vault`);
    }
});
exports.onboardingretrun = onboardingretrun;
