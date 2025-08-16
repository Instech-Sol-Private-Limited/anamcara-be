import { Request, Response } from 'express';
import { supabase } from '../app';

export const getUserVaultStats = async (req: Request, res: Response): Promise<any> => {
    try {
        const user_id = req.user?.id!;

        const [
            { data: soulpoints, error: soulpointsError },
            { data: anamcoins, error: anamcoinsError }
        ] = await Promise.all([
            supabase
                .from('soulpoints')
                .select('*')
                .eq('user_id', user_id)
                .single(),
            supabase
                .from('anamcoins')
                .select('*')
                .eq('user_id', user_id)
                .single()
        ]);

        if (soulpointsError || anamcoinsError) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch vault stats',
                error: soulpointsError?.message || anamcoinsError?.message
            });
        }

        if (!soulpoints || !anamcoins) {
            return res.status(404).json({
                success: false,
                message: 'User stats not found'
            });
        }

        const ab = Math.floor(soulpoints.points / 100);

        return res.json({
            anamcoins: anamcoins.total_coins,
            soulpoints: soulpoints.points,
            level: soulpoints.level,
            title: soulpoints.soul_title,
            accessbones: ab
        });

    } catch (error: any) {
        console.error('Error fetching vault stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

export const getUserTransactions = async (req: Request, res: Response): Promise<any> => {
    try {
        const user_id = req.user?.id!;
        const {
            page = 1,
            limit = 10,
            sort_by = 'created_at',
            order = 'desc',
            transaction_type,
            status,
            currency_type
        } = req.query;

        const offset = (Number(page) - 1) * Number(limit);

        let query = supabase
            .from('product_transactions')
            .select('*', { count: 'exact' })
            .or(`buyer_id.eq.${user_id},recipient_id.eq.${user_id}`);

        // Apply filters if provided
        if (transaction_type) {
            query = query.eq('transaction_type', transaction_type);
        }
        if (status) {
            query = query.eq('status', status);
        }
        if (currency_type) {
            query = query.eq('currency_type', currency_type);
        }

        // Execute the query with sorting and pagination
        const { data: transactions, error, count } = await query
            .order(sort_by as string, { ascending: order === 'asc' })
            .range(offset, offset + Number(limit) - 1);

        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch transactions',
                error: error.message
            });
        }

        // Calculate simple stats without seller-specific logic
        const stats = {
            total_transactions: count || 0,
            total_spent: transactions?.filter(t => t.buyer_id === user_id)
                .reduce((sum, t) => sum + t.amount, 0) || 0,
            total_earned: transactions?.filter(t => t.recipient_id === user_id)
                .reduce((sum, t) => sum + t.amount, 0) || 0
        };

        return res.json({
            success: true,
            data: {
                transactions: transactions || [],
                stats,
                pagination: {
                    current_page: Number(page),
                    total_pages: Math.ceil((count || 0) / Number(limit)),
                    total_items: count || 0,
                    items_per_page: Number(limit)
                }
            }
        });

    } catch (error: any) {
        console.error('Error fetching user transactions:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

export const getMyLibraryProducts = async (req: Request, res: Response): Promise<any> => {
    try {
        const user_id = req.user?.id!;
        const {
            page = 1,
            limit = 10,
            sort_by = 'created_at',
            order = 'desc'
        } = req.query;

        const offset = (Number(page) - 1) * Number(limit);


        const { data: libraryItems, error: libraryError, count } = await supabase
            .from('my_library')
            .select(`
            *,
            products(*)
        `, { count: 'exact' })
            .eq('user_id', user_id)
            .order(sort_by as string, { ascending: order === 'asc' })
            .range(offset, offset + Number(limit) - 1);

        if (libraryError) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch library items',
                error: libraryError.message
            });
        }

        return res.json({
            library_items: libraryItems || [],
            pagination: {
                current_page: Number(page),
                total_pages: Math.ceil((count || 0) / Number(limit)),
                total_items: count || 0,
                items_per_page: Number(limit)
            }
        });

    } catch (error: any) {
        console.error('Error fetching my library products:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
