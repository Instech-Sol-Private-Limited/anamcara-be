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
exports.getMeetingLogs = exports.getBookingLogs = exports.getProviderStatistics = exports.getBookingStatistics = exports.getTopCardsStats = void 0;
const app_1 = require("../app");
const calculateSuccessRate = (totalBookings, cancelledBookings) => {
    if (totalBookings === 0)
        return 0;
    return ((totalBookings - cancelledBookings) / totalBookings) * 100;
};
const calculateActiveBookingPercentage = (activeBookings, totalBookings) => {
    if (totalBookings === 0)
        return 0;
    return (activeBookings / totalBookings) * 100;
};
const getTopCardsStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { count: totalBookings, error: totalError } = yield app_1.supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true });
        if (totalError)
            throw totalError;
        const { count: cancelledBookings, error: cancelledError } = yield app_1.supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true })
            .eq('booking_status', 'cancelled');
        if (cancelledError)
            throw cancelledError;
        const { count: activeBookings, error: activeError } = yield app_1.supabase
            .from('slots_booking')
            .select('*', { count: 'exact', head: true })
            .in('booking_status', ['confirmed', 'pending']);
        if (activeError)
            throw activeError;
        const { data: revenueData, error: revenueError } = yield app_1.supabase
            .from('slots_booking')
            .select('price')
            .eq('booking_status', 'completed')
            .eq('payment_status', 'completed');
        if (revenueError)
            throw revenueError;
        const totalRevenue = (revenueData === null || revenueData === void 0 ? void 0 : revenueData.reduce((sum, booking) => { var _a; return sum + (parseFloat((_a = booking.price) === null || _a === void 0 ? void 0 : _a.toString()) || 0); }, 0)) || 0;
        // Get total active services count
        const { count: totalServices, error: servicesError } = yield app_1.supabase
            .from('services')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);
        if (servicesError)
            throw servicesError;
        const { data: activeSellers, error: sellersError } = yield app_1.supabase
            .from('services')
            .select('seller_id')
            .eq('is_active', true);
        if (sellersError)
            throw sellersError;
        const uniqueSellerIds = [...new Set((activeSellers === null || activeSellers === void 0 ? void 0 : activeSellers.map(service => service.seller_id)) || [])];
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
    }
    catch (error) {
        console.error('Error fetching top cards stats:', error);
        res.status(500).json({
            message: error.message || 'Failed to fetch top cards stats',
        });
    }
});
exports.getTopCardsStats = getTopCardsStats;
const getBookingStatistics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: stats, error } = yield app_1.supabase
            .from('marketplace_stats')
            .select('booking_stats')
            .single();
        if (error)
            throw error;
        const bookingStats = (stats === null || stats === void 0 ? void 0 : stats.booking_stats) || [];
        res.status(200).json(bookingStats);
    }
    catch (error) {
        console.error('Error fetching booking statistics:', error);
        res.status(500).json({
            message: 'Failed to fetch booking statistics',
        });
    }
});
exports.getBookingStatistics = getBookingStatistics;
const getProviderStatistics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: stats, error } = yield app_1.supabase
            .from('marketplace_stats')
            .select('provider_stats')
            .single();
        if (error)
            throw error;
        const providerStats = (stats === null || stats === void 0 ? void 0 : stats.provider_stats) || [];
        res.status(200).json(providerStats);
    }
    catch (error) {
        console.error('Error fetching provider statistics:', error);
        res.status(500).json({
            message: 'Failed to fetch provider statistics',
        });
    }
});
exports.getProviderStatistics = getProviderStatistics;
const getBookingLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status = 'all', limit = 10 } = req.query;
        let query = app_1.supabase
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
        const { data: bookings, error } = yield query;
        if (error)
            throw error;
        res.status(200).json(bookings || []);
    }
    catch (error) {
        console.error('Error fetching booking logs:', error);
        res.status(500).json({
            message: 'Failed to fetch booking logs',
        });
    }
});
exports.getBookingLogs = getBookingLogs;
const getMeetingLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status = 'all', limit = 10 } = req.query;
        let query = app_1.supabase
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
            const statusMap = {
                'both_attended': 'completed',
                'no_show_client': 'client_no_show',
                'no_show_provider': 'provider_no_show'
            };
            // @ts-ignore
            query = query.eq('slots_booking.meeting_status', statusMap[status] || status);
        }
        const { data: meetings, error } = yield query;
        if (error)
            throw error;
        res.status(200).json(meetings || []);
    }
    catch (error) {
        console.error('Error fetching meeting logs:', error);
        res.status(500).json({
            message: error.message,
        });
    }
});
exports.getMeetingLogs = getMeetingLogs;
