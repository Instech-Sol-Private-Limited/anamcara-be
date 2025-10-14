import { Request, Response } from "express";
import { supabase } from "../app";

export const getUserBankAccounts = async (req: Request, res: Response): Promise<any> => {
    const userId = req.user?.id!;

    try {
        const { data, error } = await supabase
            .from('bank_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('account_type', { ascending: false }) // Primary first
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            data: data || []
        });
    } catch (error) {
        console.error('Get bank accounts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch bank accounts'
        });
    }
};

export const createBankAccount = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id!;

        const {
            accountHolderName,
            accountNumber,
            bankName,
            bankCode,
            country,
            currency,
            routingNumber,
            iban,
            sortCode,
            ifscCode,
            branchCode,
            address,
            setAsPrimary = false
        } = req.body;

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

        const { data, error } = await supabase
            .from('bank_accounts')
            .insert([bankAccountData])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: `Bank account added successfully${setAsPrimary ? ' and set as primary' : ''}`,
            data
        });
    } catch (error) {
        console.error('Create bank account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add bank account'
        });
    }
};

export const deleteBankAccount = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const userId = req.user?.id!;

        const { data, error } = await supabase
            .from('bank_accounts')
            .update({ is_active: false })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

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
    } catch (error) {
        console.error('Delete bank account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete bank account'
        });
    }
};

export const setPrimaryBankAccount = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const userId = req.user?.id!;

        const { data: existingAccount, error: fetchError } = await supabase
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

        const { data, error } = await supabase
            .from('bank_accounts')
            .update({ account_type: 'primary' })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Bank account set as primary successfully',
            data
        });
    } catch (error) {
        console.error('Set primary bank account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set primary bank account'
        });
    }
};

export const getPrimaryBankAccount = async (req: Request, res: Response): Promise<any> => {
    const userId = req.user?.id!;

    try {
        const { data, error } = await supabase
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
    } catch (error) {
        console.error('Get primary bank account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch primary bank account'
        });
    }
};

export const createWithdrawalRequest = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id!;

        const {
            amount,
            bank_account_id,
            currency = 'AC',
            exchange_rate = 1.0,
            tax_rate = 0.11
        } = req.body;

        if (!amount || !bank_account_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: amount and bank_account_id are required'
            });
        }

        const { data: bankAccount, error: bankError } = await supabase
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

        const { data, error } = await supabase
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

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            data
        });
    } catch (error) {
        console.error('Create withdrawal request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create withdrawal request'
        });
    }
};

export const getWithdrawalRequests = async (req: Request, res: Response): Promise<any> => {
    const userId = req.user?.id!;

    try {
        const { data, error } = await supabase
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

        if (error) throw error;

        res.json({
            success: true,
            data: data || []
        });
    } catch (error) {
        console.error('Get withdrawal requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch withdrawal requests'
        });
    }
};

export const getWithdrawalRequestById = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const userId = req.user?.id!;

        const { data, error } = await supabase
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

        if (error) throw error;

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
    } catch (error) {
        console.error('Get withdrawal request by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch withdrawal request'
        });
    }
};

export const cancelWithdrawalRequest = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const userId = req.user?.id!;

        const { data: existingRequest, error: fetchError } = await supabase
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

        const { data, error } = await supabase
            .from('withdrawal_requests')
            .update({ status: 'rejected', rejection_reason: 'Cancelled by user' })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Withdrawal request cancelled successfully',
            data
        });
    } catch (error) {
        console.error('Cancel withdrawal request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel withdrawal request'
        });
    }
};

export const updateWithdrawalStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { status, admin_notes, rejection_reason, transaction_reference } = req.body;

        if (!['approved', 'transferred', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be approved, transferred, or rejected'
            });
        }

        const updateData: any = {
            status,
            admin_notes,
            updated_at: new Date().toISOString()
        };

        if (status === 'transferred') {
            updateData.transferred_at = new Date().toISOString();
            updateData.transaction_reference = transaction_reference;
        } else if (status === 'rejected') {
            updateData.rejection_reason = rejection_reason;
        } else if (status === 'approved') {
            updateData.processed_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('withdrawal_requests')
            .update(updateData)
            .eq('id', id)
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

        if (error) throw error;

        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found'
            });
        }

        res.json({
            success: true,
            message: `Withdrawal request ${status} successfully`,
            data
        });
    } catch (error) {
        console.error('Update withdrawal status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update withdrawal status'
        });
    }
};

export const getWithdrawalStats = async (req: Request, res: Response): Promise<any> => {
    const userId = req.user?.id!;

    try {
        const { data, error } = await supabase
            .from('withdrawal_requests')
            .select('status, net_amount_usd, created_at')
            .eq('user_id', userId);

        if (error) throw error;

        const stats = {
            total_withdrawals: data?.length || 0,
            total_amount: data?.reduce((sum, item) => sum + parseFloat(item.net_amount_usd), 0) || 0,
            pending_withdrawals: data?.filter(item => item.status === 'pending').length || 0,
            approved_withdrawals: data?.filter(item => item.status === 'approved').length || 0,
            transferred_withdrawals: data?.filter(item => item.status === 'transferred').length || 0,
            rejected_withdrawals: data?.filter(item => item.status === 'rejected').length || 0,
            recent_withdrawals: data?.slice(0, 5) || []
        };

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Get withdrawal stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch withdrawal statistics'
        });
    }
};