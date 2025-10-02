"use strict";
// import { Request, Response } from 'express';
// import { supabase } from '../app';
// import Stripe from "stripe";
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
exports.canceltransaction = exports.transactiontransactionid = exports.useridstats = exports.userID = exports.processwithdrawalsuccess = exports.createwithdrawalsession = void 0;
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
// export const createWithdrawalSession = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { acAmount, grossAmountUSD, taxAmount, netAmountUSD, metadata } = req.body;
//     if (!acAmount || acAmount < 10) {
//       res.status(400).json({ error: "Minimum withdrawal amount is 10 AC" });
//       return;
//     }
//     // Validate user has enough AnamCoins
//     const { data: anamCoinsData, error: fetchError } = await supabase
//       .from('anamcoins')
//       .select('total_coins, available_coins')
//       .eq('user_id', metadata.userId)
//       .single();
//     if (fetchError || !anamCoinsData || anamCoinsData.total_coins < acAmount) {
//       res.status(400).json({ error: "Insufficient AnamCoins balance" });
//       return;
//     }
//     // Create Stripe checkout session for withdrawal confirmation
//     const session = await stripe.checkout.sessions.create({
//       payment_method_types: ["card"],
//       line_items: [
//         {
//           price_data: {
//             currency: "usd",
//             product_data: {
//               name: `AnamCoins Withdrawal`,
//               description: `Withdraw ${acAmount} AC → $${netAmountUSD.toFixed(2)} USD (after 11% tax)`,
//             },
//             unit_amount: 100, // $1.00 processing fee
//           },
//           quantity: 1,
//         },
//       ],
//       mode: "payment",
//       success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/user/withdrawal?session_id={CHECKOUT_SESSION_ID}&success=true`,
//       cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/user/withdrawal?cancelled=true`,
//       metadata: {
//         withdrawalType: "ac_withdrawal",
//         userId: metadata.userId,
//         userEmail: metadata.userEmail || "",
//         userName: metadata.userName || "",
//         acAmount: acAmount.toString(),
//         grossAmountUSD: grossAmountUSD.toString(),
//         taxAmount: taxAmount.toString(),
//         netAmountUSD: netAmountUSD.toString(),
//         timestamp: new Date().toISOString(),
//       },
//       expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
//       ...(metadata?.userEmail && { customer_email: metadata.userEmail }),
//     });
//     res.json({ url: session.url, sessionId: session.id });
//   } catch (error: any) {
//     console.error("Withdrawal session creation error:", error);
//     res.status(500).json({ error: error.message || "Failed to create withdrawal session" });
//   }
// };
// export const processWithdrawalSuccess = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { sessionId } = req.body;
//     if (!sessionId) {
//       res.status(400).json({ error: "Session ID required" });
//       return;
//     }
//     // Retrieve session from Stripe
//     const session = await stripe.checkout.sessions.retrieve(sessionId, {
//       expand: ['payment_intent']
//     });
//     if (session.payment_status !== 'paid') {
//       res.status(400).json({ error: "Withdrawal confirmation not completed" });
//       return;
//     }
//     const metadata = session.metadata as Record<string, string>;
//     const userId = metadata.userId;
//     const acAmount = parseFloat(metadata.acAmount);
//     const grossAmountUSD = parseFloat(metadata.grossAmountUSD);
//     const taxAmount = parseFloat(metadata.taxAmount);
//     const netAmountUSD = parseFloat(metadata.netAmountUSD);
//     // Check if withdrawal already processed
//     const { data: existingWithdrawal } = await supabase
//       .from('withdrawal_transactions')
//       .select('id')
//       .eq('transaction_id', sessionId)
//       .single();
//     if (existingWithdrawal) {
//       res.status(400).json({ error: "Withdrawal already processed" });
//       return;
//     }
//     // Get current AnamCoins balance
//     const { data: currentAnamCoins, error: fetchError } = await supabase
//       .from('anamcoins')
//       .select('*')
//       .eq('user_id', userId)
//       .single();
//     if (fetchError || !currentAnamCoins || currentAnamCoins.total_coins < acAmount) {
//       res.status(400).json({ error: 'Insufficient AnamCoins balance' });
//       return;
//     }
//     // Save withdrawal transaction
//     const { data: withdrawal, error: withdrawalError } = await supabase
//       .from('withdrawal_transactions')
//       .insert({
//         transaction_id: sessionId,
//         user_id: userId,
//         ac_amount: acAmount,
//         gross_amount: grossAmountUSD,
//         tax_amount: taxAmount,
//         net_amount: netAmountUSD,
//         status: 'completed',
//         stripe_session_id: sessionId,
//         created_at: new Date().toISOString(),
//         metadata: metadata
//       })
//       .select()
//       .single();
//     if (withdrawalError) {
//       console.error('Error saving withdrawal:', withdrawalError);
//       res.status(500).json({ error: 'Failed to save withdrawal transaction' });
//       return;
//     }
//     // Update AnamCoins balance
//     const newTotalCoins = currentAnamCoins.total_coins - acAmount;
//     const newAvailableCoins = Math.max(0, currentAnamCoins.available_coins - acAmount);
//     const newSpentCoins = currentAnamCoins.spent_coins + acAmount;
//     const { error: updateError } = await supabase
//       .from('anamcoins')
//       .update({
//         total_coins: newTotalCoins,
//         available_coins: newAvailableCoins,
//         spent_coins: newSpentCoins,
//         updated_at: new Date().toISOString()
//       })
//       .eq('user_id', userId);
//     if (updateError) {
//       console.error('Error updating AnamCoins:', updateError);
//       res.status(500).json({ error: 'Failed to update AnamCoins balance' });
//       return;
//     }
//     // Add withdrawal to AnamCoins history
//     const { error: historyError } = await supabase
//       .from('anamcoins_history')
//       .insert({
//         user_id: userId,
//         transaction_type: 'spent',
//         coins_earned: 0,
//         coins_spent: acAmount,
//         description: `Withdrawn ${acAmount} AnamCoins for $${netAmountUSD.toFixed(2)} USD`,
//         transaction_id: sessionId,
//         created_at: new Date().toISOString()
//       });
//     if (historyError) {
//       console.error('Error adding withdrawal to history:', historyError);
//     }
//     console.log(`✅ Withdrawal processed for user ${userId}: -${acAmount} AC → $${netAmountUSD.toFixed(2)} USD`);
//     res.json({
//       success: true,
//       withdrawal,
//       sessionDetails: {
//         id: session.id,
//         payment_status: session.payment_status,
//         amount_total: session.amount_total,
//         metadata: session.metadata
//       },
//       message: `Successfully processed withdrawal of ${acAmount} AC for $${netAmountUSD.toFixed(2)} USD`
//     });
//   } catch (error: any) {
//     console.error("Error processing withdrawal:", error);
//     res.status(500).json({ error: error.message || "Failed to process withdrawal" });
//   }
// };
// export const getWithdrawalTransactions = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const { page = 1, limit = 20 } = req.query;
//     const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
//     const { data: transactions, error, count } = await supabase
//       .from('withdrawal_transactions')
//       .select('*', { count: 'exact' })
//       .eq('user_id', userId)
//       .order('created_at', { ascending: false })
//       .range(offset, offset + parseInt(limit as string) - 1);
//     if (error) {
//       console.error('Error fetching withdrawal transactions:', error);
//       res.status(500).json({ error: 'Failed to fetch withdrawal transactions' });
//       return;
//     }
//     res.json({
//       success: true,
//       transactions: transactions || [],
//       total: count || 0,
//       page: parseInt(page as string),
//       limit: parseInt(limit as string),
//       totalPages: Math.ceil((count || 0) / parseInt(limit as string))
//     });
//   } catch (error: any) {
//     console.error("Error fetching withdrawal history:", error);
//     res.status(500).json({ error: error.message || "Failed to fetch withdrawal history" });
//   }
// };
// export const getWithdrawalSession = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const sessionId = req.params.id;
//     const session = await stripe.checkout.sessions.retrieve(sessionId, {
//       expand: ['payment_intent', 'customer']
//     });
//     const sessionDetails = {
//       id: session.id,
//       payment_status: session.payment_status,
//       status: session.status,
//       amount_total: session.amount_total,
//       currency: session.currency,
//       customer_email: session.customer_email,
//       created: session.created,
//       metadata: session.metadata,
//       payment_intent: session.payment_intent,
//       success_url: session.success_url,
//       cancel_url: session.cancel_url
//     };
//     res.json({
//       success: true,
//       sessionDetails
//     });
//   } catch (error: any) {
//     console.error("Error fetching withdrawal session:", error);
//     res.status(500).json({ 
//       success: false,
//       error: error.message,
//       sessionId: req.params.id
//     });
//   }
// };
const express_1 = require("express");
const app_1 = require("../app");
const stripe_1 = __importDefault(require("stripe"));
const router = (0, express_1.Router)();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY);
// Create withdrawal session (Stripe checkout for confirmation)
const createwithdrawalsession = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { acAmount, grossAmountUSD, taxAmount, netAmountUSD, metadata } = req.body;
        if (!acAmount || acAmount < 10) {
            res.status(400).json({ error: "Minimum withdrawal amount is 10 AC" });
            return;
        }
        // Validate user has enough AnamCoins
        const { data: anamCoinsData, error: fetchError } = yield app_1.supabase
            .from('anamcoins')
            .select('total_coins, available_coins')
            .eq('user_id', metadata.userId)
            .single();
        if (fetchError || !anamCoinsData || anamCoinsData.total_coins < acAmount) {
            res.status(400).json({ error: "Insufficient AnamCoins balance" });
            return;
        }
        // Create a unique transaction ID
        const transactionId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // Save pending withdrawal transaction first
        const { data: pendingWithdrawal, error: insertError } = yield app_1.supabase
            .from('withdrawal_transactions')
            .insert({
            transaction_id: transactionId,
            user_id: metadata.userId,
            ac_amount: acAmount,
            gross_amount: grossAmountUSD,
            tax_amount: taxAmount,
            net_amount: netAmountUSD,
            status: 'pending',
            stripe_session_id: null,
            metadata: metadata,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .select()
            .single();
        if (insertError) {
            console.error('Error creating pending withdrawal:', insertError);
            res.status(500).json({ error: 'Failed to create withdrawal request' });
            return;
        }
        // For demonstration, create a Stripe checkout session for withdrawal confirmation
        // In production, you'd use Stripe Connect for actual payouts
        const withdrawalMetadata = {
            userId: metadata.userId,
            userEmail: metadata.userEmail || '',
            userName: metadata.userName || '',
            acAmount: acAmount.toString(),
            grossAmountUSD: grossAmountUSD.toString(),
            taxAmount: taxAmount.toString(),
            netAmountUSD: netAmountUSD.toString(),
            exchangeRate: metadata.exchangeRate || '1',
            withdrawalType: "ac_withdrawal",
            timestamp: new Date().toISOString()
        };
        const session = yield stripe.checkout.sessions.create(Object.assign({ payment_method_types: ["card"], line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `AnamCoins Withdrawal Processing`,
                            description: `Process withdrawal of ${acAmount} AC for $${netAmountUSD.toFixed(2)} USD (after 11% tax deduction)`,
                        },
                        unit_amount: 100, // $1.00 processing fee for confirmation
                    },
                    quantity: 1,
                },
            ], mode: "payment", success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/user/withdrawal?session_id={CHECKOUT_SESSION_ID}&success=true`, cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/user/withdrawal?cancelled=true`, metadata: Object.assign(Object.assign({}, withdrawalMetadata), { internalTransactionId: transactionId }), expires_at: Math.floor(Date.now() / 1000) + (30 * 60) }, (metadata.userEmail && { customer_email: metadata.userEmail })));
        // Update the withdrawal record with the Stripe session ID
        const { error: updateError } = yield app_1.supabase
            .from('withdrawal_transactions')
            .update({
            stripe_session_id: session.id,
            updated_at: new Date().toISOString()
        })
            .eq('transaction_id', transactionId);
        if (updateError) {
            console.error('Error updating withdrawal with session ID:', updateError);
        }
        res.json({ url: session.url, sessionId: session.id, transactionId });
    }
    catch (error) {
        console.error("Withdrawal session error:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.createwithdrawalsession = createwithdrawalsession;
// Process successful withdrawal after Stripe confirmation
const processwithdrawalsuccess = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            res.status(400).json({ error: "Session ID required" });
            return;
        }
        // Retrieve session from Stripe
        const session = yield stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent']
        });
        if (session.payment_status !== 'paid') {
            res.status(400).json({ error: "Withdrawal confirmation not completed" });
            return;
        }
        // Type-safe metadata handling
        const metadata = session.metadata;
        if (!metadata) {
            res.status(400).json({ error: "Session metadata not found" });
            return;
        }
        // Extract metadata with proper null checks
        const userId = metadata['userId'];
        const acAmount = parseFloat(metadata['acAmount'] || '0');
        const grossAmountUSD = parseFloat(metadata['grossAmountUSD'] || '0');
        const taxAmount = parseFloat(metadata['taxAmount'] || '0');
        const netAmountUSD = parseFloat(metadata['netAmountUSD'] || '0');
        const internalTransactionId = metadata['internalTransactionId'];
        // Find the existing withdrawal transaction
        let withdrawal;
        if (internalTransactionId) {
            const { data, error } = yield app_1.supabase
                .from('withdrawal_transactions')
                .select('*')
                .eq('transaction_id', internalTransactionId)
                .single();
            if (error || !data) {
                console.error('Error finding withdrawal transaction:', error);
                res.status(404).json({ error: 'Withdrawal transaction not found' });
                return;
            }
            withdrawal = data;
        }
        else {
            // Fallback: create new withdrawal record if not found
            const { data: newWithdrawal, error: insertError } = yield app_1.supabase
                .from('withdrawal_transactions')
                .insert({
                transaction_id: sessionId,
                user_id: userId,
                ac_amount: acAmount,
                gross_amount: grossAmountUSD,
                tax_amount: taxAmount,
                net_amount: netAmountUSD,
                status: 'completed',
                stripe_session_id: sessionId,
                metadata: metadata,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .select()
                .single();
            if (insertError) {
                console.error('Error creating withdrawal record:', insertError);
                res.status(500).json({ error: 'Failed to create withdrawal record' });
                return;
            }
            withdrawal = newWithdrawal;
        }
        // Update withdrawal status to completed
        const { error: updateError } = yield app_1.supabase
            .from('withdrawal_transactions')
            .update({
            status: 'completed',
            stripe_session_id: sessionId,
            updated_at: new Date().toISOString()
        })
            .eq('transaction_id', withdrawal.transaction_id);
        if (updateError) {
            console.error('Error updating withdrawal status:', updateError);
            res.status(500).json({ error: 'Failed to update withdrawal status' });
            return;
        }
        // Deduct AnamCoins from user's account using the database function
        const { data: balanceResult, error: balanceError } = yield app_1.supabase
            .rpc('update_user_balance_with_history', {
            p_user_id: userId,
            p_currency: 'AC',
            p_amount: acAmount,
            p_operation: 'subtract',
            p_transaction_type: 'withdrawal',
            p_description: `Withdrew ${acAmount} AnamCoins for $${netAmountUSD.toFixed(2)} USD (after tax)`,
            p_transaction_id: withdrawal.transaction_id
        });
        if (balanceError || !balanceResult) {
            console.error('Error updating AnamCoins balance:', balanceError);
            res.status(500).json({ error: 'Failed to update AnamCoins balance' });
            return;
        }
        // Update AnamCoins table directly as well
        const { data: currentAnamCoins, error: fetchAnamCoinsError } = yield app_1.supabase
            .from('anamcoins')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (!fetchAnamCoinsError && currentAnamCoins) {
            const { error: updateAnamCoinsError } = yield app_1.supabase
                .from('anamcoins')
                .update({
                total_coins: Math.max(0, currentAnamCoins.total_coins - acAmount),
                available_coins: Math.max(0, currentAnamCoins.available_coins - acAmount),
                spent_coins: currentAnamCoins.spent_coins + acAmount,
                updated_at: new Date().toISOString()
            })
                .eq('user_id', userId);
            if (updateAnamCoinsError) {
                console.error('Error updating AnamCoins record:', updateAnamCoinsError);
                // Don't fail the request, just log the error
            }
            // Add to AnamCoins history
            const { error: historyError } = yield app_1.supabase
                .from('anamcoins_history')
                .insert({
                user_id: userId,
                transaction_type: 'withdrawal',
                transaction_id: withdrawal.transaction_id,
                amount: -acAmount, // Negative for withdrawal
                balance_before: currentAnamCoins.total_coins,
                balance_after: Math.max(0, currentAnamCoins.total_coins - acAmount),
                description: `Withdrawn ${acAmount} AnamCoins for $${netAmountUSD.toFixed(2)} USD`,
                created_at: new Date().toISOString()
            });
            if (historyError) {
                console.error('Error adding AnamCoins history:', historyError);
            }
        }
        res.json({
            success: true,
            withdrawal: Object.assign(Object.assign({}, withdrawal), { status: 'completed' }),
            message: `Successfully withdrew ${acAmount} AC for $${netAmountUSD.toFixed(2)} USD`
        });
    }
    catch (error) {
        console.error("Error processing withdrawal:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.processwithdrawalsuccess = processwithdrawalsuccess;
// Get user's withdrawal transactions with pagination
const userID = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const { data: transactions, error, count } = yield app_1.supabase
            .from('withdrawal_transactions')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);
        if (error) {
            console.error('Error fetching withdrawal transactions:', error);
            res.status(500).json({ error: 'Failed to fetch withdrawal transactions' });
            return;
        }
        res.json({
            success: true,
            transactions: transactions || [],
            total: count || 0,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil((count || 0) / parseInt(limit))
        });
    }
    catch (error) {
        console.error("Error fetching withdrawal history:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.userID = userID;
// Get withdrawal statistics for a user
const useridstats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const { data: stats, error } = yield app_1.supabase
            .from('user_withdrawal_summary')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Error fetching withdrawal stats:', error);
            res.status(500).json({ error: 'Failed to fetch withdrawal statistics' });
            return;
        }
        // Return default stats if no data found
        const defaultStats = {
            user_id: userId,
            total_withdrawals: 0,
            successful_withdrawals: 0,
            pending_withdrawals: 0,
            failed_withdrawals: 0,
            total_ac_withdrawn: 0,
            total_gross_usd: 0,
            total_tax_paid: 0,
            total_net_received: 0,
            first_withdrawal: null,
            last_withdrawal: null
        };
        res.json({
            success: true,
            stats: stats || defaultStats
        });
    }
    catch (error) {
        console.error("Error fetching withdrawal statistics:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.useridstats = useridstats;
// Get specific withdrawal details by transaction ID
const transactiontransactionid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { transactionId } = req.params;
        const { data: transaction, error } = yield app_1.supabase
            .from('withdrawal_transactions')
            .select('*')
            .eq('transaction_id', transactionId)
            .single();
        if (error) {
            if (error.code === 'PGRST116') {
                res.status(404).json({ error: 'Withdrawal transaction not found' });
            }
            else {
                console.error('Error fetching withdrawal transaction:', error);
                res.status(500).json({ error: 'Failed to fetch withdrawal transaction' });
            }
            return;
        }
        res.json({
            success: true,
            transaction
        });
    }
    catch (error) {
        console.error("Error fetching withdrawal transaction:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.transactiontransactionid = transactiontransactionid;
// Cancel pending withdrawal (if not yet processed)
const canceltransaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { transactionId } = req.params;
        const { userId } = req.body;
        // Check if withdrawal exists and is still pending
        const { data: withdrawal, error: fetchError } = yield app_1.supabase
            .from('withdrawal_transactions')
            .select('*')
            .eq('transaction_id', transactionId)
            .eq('user_id', userId)
            .single();
        if (fetchError || !withdrawal) {
            res.status(404).json({ error: 'Withdrawal transaction not found' });
            return;
        }
        if (withdrawal.status !== 'pending') {
            res.status(400).json({ error: 'Cannot cancel withdrawal that is not pending' });
            return;
        }
        // Update withdrawal status to cancelled
        const { error: updateError } = yield app_1.supabase
            .from('withdrawal_transactions')
            .update({
            status: 'failed', // Use 'failed' status for cancelled withdrawals
            updated_at: new Date().toISOString()
        })
            .eq('transaction_id', transactionId);
        if (updateError) {
            console.error('Error cancelling withdrawal:', updateError);
            res.status(500).json({ error: 'Failed to cancel withdrawal' });
            return;
        }
        res.json({
            success: true,
            message: 'Withdrawal cancelled successfully'
        });
    }
    catch (error) {
        console.error("Error cancelling withdrawal:", error);
        res.status(500).json({ error: error.message });
    }
});
exports.canceltransaction = canceltransaction;
exports.default = router;
