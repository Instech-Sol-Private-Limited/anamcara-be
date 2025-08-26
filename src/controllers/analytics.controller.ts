import { Request, Response } from 'express';
import { supabase } from '../app';

const calculateSuccessRate = (totalBookings: number, cancelledBookings: number): number => {
    if (totalBookings === 0) return 0;
    return ((totalBookings - cancelledBookings) / totalBookings) * 100;
};

const calculateActiveBookingPercentage = (activeBookings: number, totalBookings: number): number => {
    if (totalBookings === 0) return 0;
    return (activeBookings / totalBookings) * 100;
};

const getTopCardsStats = async (req: Request, res: Response): Promise<any> => {
    try {
        const { count: totalBookings, error: totalError } = await supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true });

        if (totalError) throw totalError;

        const { count: cancelledBookings, error: cancelledError } = await supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true })
            .eq('booking_status', 'cancelled');

        if (cancelledError) throw cancelledError;

        const { count: activeBookings, error: activeError } = await supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true })
            .in('booking_status', ['confirmed', 'pending']);

        if (activeError) throw activeError;

        const { data: revenueData, error: revenueError } = await supabase
            .from('slots_booking')
            .select('price')
            .eq('booking_status', 'completed')
            .eq('payment_status', 'completed');

        if (revenueError) throw revenueError;

        const totalRevenue = revenueData?.reduce((sum, booking) => sum + (parseFloat(booking.price?.toString()) || 0), 0) || 0;

        // Get total active services count
        const { count: totalServices, error: servicesError } = await supabase
            .from('services')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        if (servicesError) throw servicesError;

        const { data: activeSellers, error: sellersError } = await supabase
            .from('services')
            .select('seller_id')
            .eq('is_active', true);

        if (sellersError) throw sellersError;

        const uniqueSellerIds = [...new Set(activeSellers?.map(service => service.seller_id) || [])];
        const activeUsers = uniqueSellerIds.length;

        const activeProviders = activeUsers;

        const successRate = calculateSuccessRate(totalBookings || 0, cancelledBookings || 0);
        const activeBookingRate = calculateActiveBookingPercentage(activeBookings || 0, totalBookings || 0);

        res.status(200).json({
            totalBookings: totalBookings || 0,
            successRate: parseFloat(successRate.toFixed(1)),
            activeBookings: activeBookings || 0,
            activeBookingRate: parseFloat(activeBookingRate.toFixed(1)),
            totalRevenue: totalRevenue,
            totalServices: totalServices || 0,
            activeUsers: activeUsers,
            activeProviders: activeProviders
        });
    } catch (error: any) {
        console.error('Error fetching top cards stats:', error);
        res.status(500).json({
            message: error.message || 'Failed to fetch top cards stats',
        });
    }
};

const getBookingStatistics = async (req: Request, res: Response): Promise<any> => {
    try {
        const { data: stats, error } = await supabase
            .from('marketplace_stats')
            .select('booking_stats')
            .single();

        if (error) throw error;

        const bookingStats = stats?.booking_stats || [];
        res.status(200).json(bookingStats);
    } catch (error) {
        console.error('Error fetching booking statistics:', error);
        res.status(500).json({
            message: 'Failed to fetch booking statistics',
        });
    }
};

const getProviderStatistics = async (req: Request, res: Response): Promise<any> => {
    try {
        const { data: stats, error } = await supabase
            .from('marketplace_stats')
            .select('provider_stats')
            .single();

        if (error) throw error;

        const providerStats = stats?.provider_stats || [];
        res.status(200).json(providerStats);
    } catch (error) {
        console.error('Error fetching provider statistics:', error);
        res.status(500).json({
            message: 'Failed to fetch provider statistics',
        });
    }
};

const getBookingLogs = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status = 'all', limit = 10 } = req.query;

        let query = supabase
            .from('slots_booking')
            .select(`
        *,
        services:service_id (service_title, service_category)
      `)
            .order('created_at', { ascending: false })
            .limit(Number(limit));

        if (status !== 'all') {
            query = query.eq('booking_status', status);
        }

        const { data: bookings, error } = await query;

        if (error) throw error;

        res.status(200).json(bookings || []);
    } catch (error) {
        console.error('Error fetching booking logs:', error);
        res.status(500).json({
            message: 'Failed to fetch booking logs',
        });
    }
};

const getMeetingLogs = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status = 'all', limit = 10 } = req.query;

        let query = supabase
            .from('meetings_track')
            .select(`
        *,
        slots_booking:booking_id (
          service_title,
          seller_name,
          buyer_name,
          booking_status,
          meeting_status
        )
      `)
            .order('created_at', { ascending: false })
            .limit(Number(limit));

        if (status !== 'all') {
            const statusMap: { [key: string]: string } = {
                'both_attended': 'completed',
                'no_show_client': 'client_no_show',
                'no_show_provider': 'provider_no_show'
            };
            // @ts-ignore
            query = query.eq('slots_booking.meeting_status', statusMap[status] || status);
        }

        const { data: meetings, error } = await query;

        if (error) throw error;

        res.status(200).json(meetings || []);
    } catch (error: any) {
        console.error('Error fetching meeting logs:', error);
        res.status(500).json({
            message: error.message,
        });
    }
};

export {
    getTopCardsStats,
    getBookingStatistics,
    getProviderStatistics,
    getBookingLogs,
    getMeetingLogs
};