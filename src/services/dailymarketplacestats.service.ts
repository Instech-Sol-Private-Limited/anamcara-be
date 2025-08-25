import { supabase } from '../app';

export const collectDailyStats = async (): Promise<any> => {
    try {
        console.log('🔄 Starting daily marketplace stats collection...');

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayDate = yesterday.toISOString().split('T')[0];

        // Get the single stats row
        const { data: existingStats, error: fetchError } = await supabase
            .from('marketplace_stats')
            .select('*')
            .order('date', { ascending: false })
            .limit(1)
            .single();

        if (fetchError) throw fetchError;

        let bookingStats = existingStats?.booking_stats || [];
        let providerStats = existingStats?.provider_stats || [];

        // Collect actual data for yesterday's bookings
        const [
            totalBookings,
            completedBookings,
            cancelledBookings,
            pendingBookings,
            dailyRevenue
        ] = await Promise.all([
            calculateDailyBookings(yesterdayDate),
            calculateCompletedBookings(yesterdayDate),
            calculateCancelledBookings(yesterdayDate),
            calculatePendingBookings(yesterdayDate),
            calculateDailyRevenue(yesterdayDate)
        ]);

        // Update booking stats (maintain 30 days)
        const bookingIndex = bookingStats.findIndex((stat: any) => stat.date === yesterdayDate);
        if (bookingIndex !== -1) {
            bookingStats[bookingIndex] = {
                date: yesterdayDate,
                total: totalBookings,
                completed: completedBookings,
                cancelled: cancelledBookings,
                pending: pendingBookings,
                revenue: dailyRevenue
            };
        } else {
            bookingStats.push({
                date: yesterdayDate,
                total: totalBookings,
                completed: completedBookings,
                cancelled: cancelledBookings,
                pending: pendingBookings,
                revenue: dailyRevenue
            });

            // Keep only last 30 days
            if (bookingStats.length > 30) {
                bookingStats = bookingStats.slice(-30);
            }
        }

        // Update the single row in database
        const { error: updateError } = await supabase
            .from('marketplace_stats')
            .update({
                date: today.toISOString().split('T')[0],
                booking_stats: bookingStats,
                provider_stats: providerStats, // Provider stats remain unchanged (updated monthly)
                updated_at: new Date().toISOString()
            })
            .eq('id', existingStats.id);

        if (updateError) throw updateError;

        console.log('✅ Daily stats updated successfully for:', yesterdayDate);

    } catch (error) {
        console.error('❌ Error collecting daily stats:', error);
        throw error;
    }
};

export const collectMonthlyProviderStats = async (): Promise<any> => {
    try {
        console.log('🔄 Starting monthly provider stats collection...');

        const today = new Date();
        const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM

        // Get the single stats row
        const { data: existingStats, error: fetchError } = await supabase
            .from('marketplace_stats')
            .select('*')
            .order('date', { ascending: false })
            .limit(1)
            .single();

        if (fetchError) throw fetchError;

        let providerStats = existingStats?.provider_stats || [];

        // Calculate monthly metrics
        const [
            activeProviders,
            totalProviders,
            newProviders,
            servicesAdded
        ] = await Promise.all([
            calculateActiveProviders(),
            calculateTotalProviders(),
            calculateNewProvidersForMonth(currentMonth),
            calculateServicesAddedForMonth(currentMonth)
        ]);

        // Create/update monthly provider stat
        const monthlyProviderData = {
            month: currentMonth,
            active_providers: activeProviders,
            total_providers: totalProviders,
            new_providers: newProviders,
            services_added: servicesAdded
        };

        // Find and update existing monthly data or add new
        const monthlyIndex = providerStats.findIndex((stat: any) => stat.month === currentMonth);
        if (monthlyIndex !== -1) {
            providerStats[monthlyIndex] = monthlyProviderData;
        } else {
            providerStats.push(monthlyProviderData);
        }

        // Keep only last 12 months of monthly data
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().slice(0, 7);

        providerStats = providerStats.filter((stat: any) => {
            return stat.month >= twelveMonthsAgoStr;
        });

        // Update the single row
        const { error: updateError } = await supabase
            .from('marketplace_stats')
            .update({
                provider_stats: providerStats,
                updated_at: new Date().toISOString()
            })
            .eq('id', existingStats.id);

        if (updateError) throw updateError;

        console.log('✅ Monthly provider stats collected successfully for:', currentMonth);
        return monthlyProviderData;

    } catch (error) {
        console.error('❌ Error in monthly provider stats collection:', error);
        throw error;
    }
};

const calculateBookingStats = async (days: number) => {
    const stats = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        // Get total bookings for the day
        const { count: totalBookings, error: totalError } = await supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', `${dateStr}T00:00:00`)
            .lte('created_at', `${dateStr}T23:59:59`);

        if (totalError) throw totalError;

        // Get completed bookings
        const { count: completedBookings, error: completedError } = await supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true })
            .eq('booking_status', 'completed')
            .gte('created_at', `${dateStr}T00:00:00`)
            .lte('created_at', `${dateStr}T23:59:59`);

        if (completedError) throw completedError;

        // Get confirmed bookings
        const { count: confirmedBookings, error: confirmedError } = await supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true })
            .eq('booking_status', 'confirmed')
            .gte('created_at', `${dateStr}T00:00:00`)
            .lte('created_at', `${dateStr}T23:59:59`);

        if (confirmedError) throw confirmedError;

        // Get pending bookings
        const { count: pendingBookings, error: pendingError } = await supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true })
            .eq('booking_status', 'pending')
            .gte('created_at', `${dateStr}T00:00:00`)
            .lte('created_at', `${dateStr}T23:59:59`);

        if (pendingError) throw pendingError;

        // Get cancelled bookings
        const { count: cancelledBookings, error: cancelledError } = await supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true })
            .eq('booking_status', 'cancelled')
            .gte('created_at', `${dateStr}T00:00:00`)
            .lte('created_at', `${dateStr}T23:59:59`);

        if (cancelledError) throw cancelledError;

        // Calculate active bookings (confirmed + pending)
        const activeBookings = (confirmedBookings || 0) + (pendingBookings || 0);

        // Get revenue - since there's no payment_status, we'll calculate revenue differently
        // Option 1: Revenue from completed bookings only (most conservative)
        const { data: revenueData, error: revenueError } = await supabase
            .from('slots_booking')
            .select('price')
            .eq('booking_status', 'completed')
            .gte('created_at', `${dateStr}T00:00:00`)
            .lte('created_at', `${dateStr}T23:59:59`);

        if (revenueError) throw revenueError;

        // Option 2: If you want to include confirmed bookings as revenue (since they're paid)
        const { data: confirmedRevenueData, error: confirmedRevenueError } = await supabase
            .from('slots_booking')
            .select('price')
            .eq('booking_status', 'confirmed')
            .gte('created_at', `${dateStr}T00:00:00`)
            .lte('created_at', `${dateStr}T23:59:59`);

        if (confirmedRevenueError) throw confirmedRevenueError;

        // Calculate total revenue (completed + confirmed bookings)
        const completedRevenue = revenueData?.reduce((sum, booking) => sum + (parseFloat(booking.price?.toString()) || 0), 0) || 0;
        const confirmedRevenue = confirmedRevenueData?.reduce((sum, booking) => sum + (parseFloat(booking.price?.toString()) || 0), 0) || 0;
        const totalRevenue = completedRevenue + confirmedRevenue;

        stats.push({
            date: dateStr,
            total: totalBookings || 0,
            completed: completedBookings || 0,
            confirmed: confirmedBookings || 0,
            pending: pendingBookings || 0,
            active: activeBookings,
            cancelled: cancelledBookings || 0,
            revenue: totalRevenue, // Using total revenue (completed + confirmed)
            completed_revenue: completedRevenue, // Just completed revenue
            confirmed_revenue: confirmedRevenue // Just confirmed revenue
        });
    }

    return stats;
};

const calculateProviderStats = async (months: number) => {
    const stats = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const monthStr = `${year}-${month.toString().padStart(2, '0')}`;

        const { count: newProviders, error: providersError } = await supabase
            .from('sellers')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', `${year}-${month.toString().padStart(2, '0')}-01`)
            .lte('created_at', `${year}-${month.toString().padStart(2, '0')}-${new Date(year, month, 0).getDate()}`);

        if (providersError) throw providersError;

        const { data: activeProvidersData, error: activeError } = await supabase
            .from('services')
            .select('seller_id')
            .eq('is_active', true)
            .gte('created_at', `${year}-${month.toString().padStart(2, '0')}-01`)
            .lte('created_at', `${year}-${month.toString().padStart(2, '0')}-${new Date(year, month, 0).getDate()}`);

        if (activeError) throw activeError;

        const uniqueActiveProviders = [...new Set(activeProvidersData?.map(service => service.seller_id) || [])].length;

        stats.push({
            month: monthStr,
            new_providers: newProviders || 0,
            active_providers: uniqueActiveProviders
        });
    }

    return stats;
};

export const initializeStats = async () => {
    try {
        console.log('📊 Initializing marketplace stats...');

        const { data: existingStats, error: checkError } = await supabase
            .from('marketplace_stats')
            .select('*')
            .order('date', { ascending: false })
            .limit(1);


        if (checkError && checkError.code === 'PGRST116') {
            const today = new Date().toISOString().split('T')[0];

            const bookingStats = await calculateBookingStats(30);

            const providerStats = await calculateProviderStats(12);
            console.log(bookingStats,providerStats)

            const { error: insertError } = await supabase
                .from('marketplace_stats')
                .insert({
                    date: today,
                    booking_stats: bookingStats,
                    provider_stats: providerStats,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (insertError) {
                throw insertError;
            }

            console.log('✅ Created initial marketplace stats with real 30 days booking and 12 months provider data');

        } else if (checkError) {
            throw checkError;
        } else if (existingStats && existingStats.length === 0) {
            // Table exists but is empty
            const today = new Date().toISOString().split('T')[0];
            const bookingStats = await calculateBookingStats(30);
            const providerStats = await calculateProviderStats(12);

            const { error: insertError } = await supabase
                .from('marketplace_stats')
                .insert({
                    date: today,
                    booking_stats: bookingStats,
                    provider_stats: providerStats,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (insertError) {
                throw insertError;
            }

            console.log('✅ Created initial marketplace stats with real 30 days booking and 12 months provider data');
        } else {
            console.log('✅ Marketplace stats already initialized');
        }

    } catch (error) {
        console.error('❌ Error initializing marketplace stats:', error);
    }
};

// Additional helper functions
const calculateCancelledBookings = async (date: string): Promise<number> => {
    const { count, error } = await supabase
        .from('slots_booking')
        .select('*', { count: 'exact', head: true })
        .eq('booking_status', 'cancelled')
        .eq('meeting_date', date);

    if (error) throw error;
    return count || 0;
};

const calculatePendingBookings = async (date: string): Promise<number> => {
    const { count, error } = await supabase
        .from('slots_booking')
        .select('*', { count: 'exact', head: true })
        .eq('booking_status', 'pending')
        .eq('meeting_date', date);

    if (error) throw error;
    return count || 0;
};

const calculateServicesAddedForMonth = async (month: string): Promise<number> => {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];

    const { count, error } = await supabase
        .from('services')
        .select('*', { count: 'exact', head: true })
        .gte('created_at::date', startDate)
        .lte('created_at::date', endDate);

    if (error) throw error;
    return count || 0;
};

// Keep your existing helper functions:
const calculateDailyBookings = async (date: string): Promise<number> => {
    const { count, error } = await supabase
        .from('slots_booking')
        .select('*', { count: 'exact', head: true })
        .eq('meeting_date', date);

    if (error) throw error;
    return count || 0;
};

const calculateDailyRevenue = async (date: string): Promise<number> => {
    const { data, error } = await supabase
        .from('slots_booking')
        .select('price')
        .eq('booking_status', 'completed')
        .eq('payment_status', 'completed')
        .eq('meeting_date', date);

    if (error) throw error;

    return data?.reduce((total, booking) => total + (parseFloat(booking.price?.toString()) || 0), 0) || 0;
};

const calculateCompletedBookings = async (date: string): Promise<number> => {
    const { count, error } = await supabase
        .from('slots_booking')
        .select('*', { count: 'exact', head: true })
        .eq('booking_status', 'completed')
        .eq('meeting_date', date);

    if (error) throw error;
    return count || 0;
};

const calculateActiveProviders = async (): Promise<number> => {
    const { data: activeServices, error } = await supabase
        .from('services')
        .select('seller_id')
        .eq('is_active', true);

    if (error) throw error;

    const uniqueSellerIds = [...new Set(activeServices?.map(service => service.seller_id) || [])];
    return uniqueSellerIds.length;
};

const calculateTotalProviders = async (): Promise<number> => {
    const { data: allServices, error } = await supabase
        .from('services')
        .select('seller_id');

    if (error) throw error;

    const uniqueSellerIds = [...new Set(allServices?.map(service => service.seller_id) || [])];
    return uniqueSellerIds.length;
};

const calculateNewProvidersForMonth = async (month: string): Promise<number> => {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];

    const { data: monthServices, error } = await supabase
        .from('services')
        .select('seller_id, created_at')
        .gte('created_at::date', startDate)
        .lte('created_at::date', endDate);

    if (error) throw error;

    if (!monthServices || monthServices.length === 0) return 0;

    let newProviderCount = 0;
    const processedSellers = new Set();

    for (const service of monthServices) {
        if (processedSellers.has(service.seller_id)) continue;

        const { data: sellerServices, error: sellerError } = await supabase
            .from('services')
            .select('created_at')
            .eq('seller_id', service.seller_id)
            .order('created_at', { ascending: true })
            .limit(1);

        if (sellerError) continue;

        if (sellerServices && sellerServices.length > 0) {
            const firstServiceDate = new Date(sellerServices[0].created_at).toISOString().slice(0, 7);
            if (firstServiceDate === month) {
                newProviderCount++;
                processedSellers.add(service.seller_id);
            }
        }
    }

    return newProviderCount;
};