import cron from 'node-cron';
import { supabase } from '../app';

// Run daily at 2 AM
export const setupPaymentCron = () => {
    cron.schedule('0 2 * * *', async () => {
        try {
            console.log('Running payment processing cron job...');
            await processPendingPayments();
        } catch (error) {
            console.error('Error in payment cron job:', error);
        }
    });
};

export const processPendingPayments = async () => {
    const today = new Date().toISOString();
    const BATCH_SIZE = 50;

    let processedCount = 0;
    let hasMore = true;

    while (hasMore) {
        const { data: payments, error } = await supabase
            .from('pending_payments')
            .select('*')
            .lte('payout_date', today)
            .eq('status', 'pending')
            .order('payout_date', { ascending: true })
            .range(processedCount, processedCount + BATCH_SIZE - 1);

        if (error) throw error;

        if (!payments || payments.length === 0) {
            hasMore = false;
            continue;
        }

        await Promise.all(payments.map(async (payment) => {
            try {
                await supabase
                    .from('pending_payments')
                    .update({ status: 'processing' })
                    .eq('id', payment.id);

                const { data: sellerCoins, error: fetchError } = await supabase
                    .from('anamcoins')
                    .select('available_coins, earned_coins')
                    .eq('user_id', payment.seller_id)
                    .single();

                if (fetchError || !sellerCoins) throw fetchError || new Error('Seller coins record not found');

                // Transfer amount to seller (no buyer deduction needed)
                const { error: transferError } = await supabase
                    .from('anamcoins')
                    .update({
                        available_coins: sellerCoins.available_coins + payment.amount,
                        earned_coins: sellerCoins.earned_coins + payment.amount,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', payment.seller_id);

                if (transferError) throw transferError;

                // Mark payment as completed
                await supabase
                    .from('pending_payments')
                    .update({
                        status: 'completed',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', payment.id);

                console.log(`Transferred ${payment.amount} coins to seller ${payment.seller_id}`);

            } catch (err) {
                console.error(`Failed to process payment ${payment.id}:`, err);
                await supabase
                    .from('pending_payments')
                    .update({
                        status: 'failed',
                        error_message: err instanceof Error ? err.message : 'Unknown error',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', payment.id);
            }
        }));

        processedCount += payments.length;
    }

    console.log(`Payment processing completed. Processed ${processedCount} payments.`);
};