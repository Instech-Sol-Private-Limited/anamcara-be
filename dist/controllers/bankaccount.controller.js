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
exports.getWithdrawalStats = exports.updateWithdrawalStatus = exports.getAllWithdrawalRequests = exports.cancelWithdrawalRequest = exports.getWithdrawalRequestById = exports.getWithdrawalRequests = exports.createWithdrawalRequest = exports.getPrimaryBankAccount = exports.setPrimaryBankAccount = exports.deleteBankAccount = exports.createBankAccount = exports.getUserBankAccounts = void 0;
const app_1 = require("../app");
const getUserBankAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    try {
        const { data, error } = yield app_1.supabase
            .from('bank_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('account_type', { ascending: false }) // Primary first
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({
            success: true,
            data: data || []
        });
    }
    catch (error) {
        console.error('Get bank accounts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch bank accounts'
        });
    }
});
exports.getUserBankAccounts = getUserBankAccounts;
const createBankAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { accountHolderName, accountNumber, bankName, bankCode, country, currency, routingNumber, iban, sortCode, ifscCode, branchCode, address, setAsPrimary = false } = req.body;
        if (!accountHolderName || !accountNumber || !bankName || !country) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: accountHolderName, accountNumber, bankName, country are required'
            });
        }
        const bankAccountData = {
            user_id: userId,
            account_holder_name: accountHolderName,
            account_number: accountNumber,
            bank_name: bankName,
            bank_code: bankCode,
            country_code: country,
            currency: currency || 'USD',
            routing_number: routingNumber,
            iban: iban,
            sort_code: sortCode,
            ifsc_code: ifscCode,
            branch_code: branchCode,
            bank_address: address,
            account_type: setAsPrimary ? 'primary' : 'secondary',
            is_active: true
        };
        const { data, error } = yield app_1.supabase
            .from('bank_accounts')
            .insert([bankAccountData])
            .select()
            .single();
        if (error)
            throw error;
        res.status(201).json({
            success: true,
            message: `Bank account added successfully${setAsPrimary ? ' and set as primary' : ''}`,
            data
        });
    }
    catch (error) {
        console.error('Create bank account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add bank account'
        });
    }
});
exports.createBankAccount = createBankAccount;
const deleteBankAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { data, error } = yield app_1.supabase
            .from('bank_accounts')
            .update({ is_active: false })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();
        if (error)
            throw error;
        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Bank account not found'
            });
        }
        res.json({
            success: true,
            message: 'Bank account deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete bank account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete bank account'
        });
    }
});
exports.deleteBankAccount = deleteBankAccount;
const setPrimaryBankAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { data: existingAccount, error: fetchError } = yield app_1.supabase
            .from('bank_accounts')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();
        if (fetchError || !existingAccount) {
            return res.status(404).json({
                success: false,
                message: 'Bank account not found'
            });
        }
        const { data, error } = yield app_1.supabase
            .from('bank_accounts')
            .update({ account_type: 'primary' })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();
        if (error)
            throw error;
        res.json({
            success: true,
            message: 'Bank account set as primary successfully',
            data
        });
    }
    catch (error) {
        console.error('Set primary bank account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set primary bank account'
        });
    }
});
exports.setPrimaryBankAccount = setPrimaryBankAccount;
const getPrimaryBankAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    try {
        const { data, error } = yield app_1.supabase
            .from('bank_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('account_type', 'primary')
            .eq('is_active', true)
            .single();
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        res.json({
            success: true,
            data: data || null
        });
    }
    catch (error) {
        console.error('Get primary bank account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch primary bank account'
        });
    }
});
exports.getPrimaryBankAccount = getPrimaryBankAccount;
const createWithdrawalRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { amount, bank_account_id, currency = 'AC', exchange_rate = 1.0, tax_rate = 0.11 } = req.body;
        if (!amount || !bank_account_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: amount and bank_account_id are required'
            });
        }
        const { data: bankAccount, error: bankError } = yield app_1.supabase
            .from('bank_accounts')
            .select('*')
            .eq('id', bank_account_id)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();
        if (bankError || !bankAccount) {
            return res.status(404).json({
                success: false,
                message: 'Bank account not found or not active'
            });
        }
        if (bankAccount.account_type !== 'primary') {
            return res.status(400).json({
                success: false,
                message: 'Withdrawals can only be made from primary bank accounts'
            });
        }
        const grossAmountUSD = parseFloat(amount) * exchange_rate;
        const taxAmount = grossAmountUSD * tax_rate;
        const netAmountUSD = grossAmountUSD - taxAmount;
        const withdrawalData = {
            user_id: userId,
            amount: parseFloat(amount),
            currency,
            bank_account_id,
            exchange_rate: exchange_rate,
            gross_amount_usd: grossAmountUSD,
            tax_amount: taxAmount,
            net_amount_usd: netAmountUSD,
            tax_rate: tax_rate,
            status: 'pending'
        };
        const { data, error } = yield app_1.supabase
            .from('withdrawal_requests')
            .insert([withdrawalData])
            .select(`
                *,
                bank_accounts (
                    bank_name,
                    account_holder_name,
                    account_number,
                    country_code,
                    currency
                )
            `)
            .single();
        if (error)
            throw error;
        res.status(201).json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            data
        });
    }
    catch (error) {
        console.error('Create withdrawal request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create withdrawal request'
        });
    }
});
exports.createWithdrawalRequest = createWithdrawalRequest;
const getWithdrawalRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    try {
        const { data, error } = yield app_1.supabase
            .from('withdrawal_requests')
            .select(`
                *,
                bank_accounts (
                    bank_name,
                    account_holder_name,
                    account_number,
                    country_code,
                    currency
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({
            success: true,
            data: data || []
        });
    }
    catch (error) {
        console.error('Get withdrawal requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch withdrawal requests'
        });
    }
});
exports.getWithdrawalRequests = getWithdrawalRequests;
const getWithdrawalRequestById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { data, error } = yield app_1.supabase
            .from('withdrawal_requests')
            .select(`
                *,
                bank_accounts (
                    bank_name,
                    account_holder_name,
                    account_number,
                    country_code,
                    currency
                )
            `)
            .eq('id', id)
            .eq('user_id', userId)
            .single();
        if (error)
            throw error;
        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found'
            });
        }
        res.json({
            success: true,
            data
        });
    }
    catch (error) {
        console.error('Get withdrawal request by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch withdrawal request'
        });
    }
});
exports.getWithdrawalRequestById = getWithdrawalRequestById;
const cancelWithdrawalRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { data: existingRequest, error: fetchError } = yield app_1.supabase
            .from('withdrawal_requests')
            .select('id, status')
            .eq('id', id)
            .eq('user_id', userId)
            .single();
        if (fetchError || !existingRequest) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found'
            });
        }
        if (existingRequest.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending withdrawal requests can be cancelled'
            });
        }
        const { data, error } = yield app_1.supabase
            .from('withdrawal_requests')
            .update({ status: 'rejected', rejection_reason: 'Cancelled by user' })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();
        if (error)
            throw error;
        res.json({
            success: true,
            message: 'Withdrawal request cancelled successfully',
            data
        });
    }
    catch (error) {
        console.error('Cancel withdrawal request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel withdrawal request'
        });
    }
});
exports.cancelWithdrawalRequest = cancelWithdrawalRequest;
// admin
const getAllWithdrawalRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield app_1.supabase
            .from('withdrawal_requests')
            .select(`
                *,
                bank_accounts (
                    user_id,
                    bank_name,
                    account_holder_name,
                    account_number,
                    country_code,
                    currency
                )
            `)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        // Fetch profiles and coins for each user
        const withdrawalRequestsWithUserData = yield Promise.all((data || []).map((request) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const userId = (_a = request.bank_accounts) === null || _a === void 0 ? void 0 : _a.user_id;
            if (!userId) {
                return Object.assign(Object.assign({}, request), { profiles: null, user_available_coins: 0 });
            }
            // Get user profile
            const { data: profileData, error: profileError } = yield app_1.supabase
                .from('profiles')
                .select('first_name, last_name, avatar_url, username')
                .eq('id', userId)
                .single();
            // Get available coins for the user
            const { data: coinsData, error: coinsError } = yield app_1.supabase
                .from('anamcoins')
                .select('available_coins')
                .eq('user_id', userId)
                .single();
            return Object.assign(Object.assign({}, request), { profiles: profileError ? null : profileData, user_available_coins: coinsError ? 0 : ((coinsData === null || coinsData === void 0 ? void 0 : coinsData.available_coins) || 0) });
        })));
        res.json({
            success: true,
            data: withdrawalRequestsWithUserData
        });
    }
    catch (error) {
        console.error('Get withdrawal requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch withdrawal requests'
        });
    }
});
exports.getAllWithdrawalRequests = getAllWithdrawalRequests;
const updateWithdrawalStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { status, admin_notes, rejection_reason, transaction_reference } = req.body;
        if (!['approved', 'transferred', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be approved, transferred, or rejected'
            });
        }
        const { data: existingRequest, error: fetchError } = yield app_1.supabase
            .from('withdrawal_requests')
            .select(`
                *,
                bank_accounts (
                    user_id
                )
            `)
            .eq('id', id)
            .single();
        if (fetchError)
            throw fetchError;
        if (!existingRequest) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found'
            });
        }
        const userId = (_a = existingRequest.bank_accounts) === null || _a === void 0 ? void 0 : _a.user_id;
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'Bank account user not found'
            });
        }
        const updateData = {
            status,
            admin_notes,
            updated_at: new Date().toISOString()
        };
        if (status === 'transferred') {
            updateData.transferred_at = new Date().toISOString();
            updateData.transaction_reference = transaction_reference;
            const coinsToDeduct = existingRequest.gross_amount_usd;
            const { data: coinsData, error: coinsError } = yield app_1.supabase
                .from('anamcoins')
                .select('available_coins, total_coins, spent_coins')
                .eq('user_id', userId)
                .single();
            if (coinsError)
                throw coinsError;
            if (!coinsData) {
                return res.status(404).json({
                    success: false,
                    message: 'User anamcoins record not found'
                });
            }
            if (coinsData.available_coins < coinsToDeduct) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient anamcoins for this withdrawal'
                });
            }
            const { error: updateCoinsError } = yield app_1.supabase
                .from('anamcoins')
                .update({
                available_coins: coinsData.available_coins - coinsToDeduct,
                spent_coins: coinsData.spent_coins + coinsToDeduct,
                updated_at: new Date().toISOString()
            })
                .eq('user_id', userId);
            if (updateCoinsError)
                throw updateCoinsError;
        }
        else if (status === 'rejected') {
            updateData.rejection_reason = rejection_reason;
        }
        else if (status === 'approved') {
            updateData.processed_at = new Date().toISOString();
        }
        const { data, error } = yield app_1.supabase
            .from('withdrawal_requests')
            .update(updateData)
            .eq('id', id)
            .select(`
                *,
                bank_accounts (
                    user_id,
                    bank_name,
                    account_holder_name,
                    account_number,
                    country_code,
                    currency
                )
            `)
            .single();
        if (error)
            throw error;
        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found'
            });
        }
        const [profileResponse, coinsResponse] = yield Promise.all([
            app_1.supabase
                .from('profiles')
                .select('first_name, last_name, avatar_url, username')
                .eq('id', userId)
                .single(),
            app_1.supabase
                .from('anamcoins')
                .select('available_coins')
                .eq('user_id', userId)
                .single()
        ]);
        const responseData = Object.assign(Object.assign({}, data), { profiles: profileResponse.error ? null : profileResponse.data, user_available_coins: coinsResponse.error ? 0 : (((_b = coinsResponse.data) === null || _b === void 0 ? void 0 : _b.available_coins) || 0) });
        res.json({
            success: true,
            message: `Withdrawal request ${status} successfully`,
            data: responseData
        });
    }
    catch (error) {
        console.error('Update withdrawal status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update withdrawal status'
        });
    }
});
exports.updateWithdrawalStatus = updateWithdrawalStatus;
const getWithdrawalStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield app_1.supabase
            .from('withdrawal_requests')
            .select('status, net_amount_usd, created_at');
        if (error)
            throw error;
        const stats = {
            total_withdrawals: (data === null || data === void 0 ? void 0 : data.length) || 0,
            total_amount: (data === null || data === void 0 ? void 0 : data.reduce((sum, item) => sum + parseFloat(item.net_amount_usd), 0)) || 0,
            pending_withdrawals: (data === null || data === void 0 ? void 0 : data.filter(item => item.status === 'pending').length) || 0,
            approved_withdrawals: (data === null || data === void 0 ? void 0 : data.filter(item => item.status === 'approved').length) || 0,
            transferred_withdrawals: (data === null || data === void 0 ? void 0 : data.filter(item => item.status === 'transferred').length) || 0,
            rejected_withdrawals: (data === null || data === void 0 ? void 0 : data.filter(item => item.status === 'rejected').length) || 0,
            recent_withdrawals: (data === null || data === void 0 ? void 0 : data.slice(0, 5)) || []
        };
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        console.error('Get withdrawal stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch withdrawal statistics'
        });
    }
});
exports.getWithdrawalStats = getWithdrawalStats;
