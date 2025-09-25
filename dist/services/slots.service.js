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
exports.handleOtherStatus = exports.handleCompletedStatus = exports.handleCancelledStatus = exports.handleErrorResponse = exports.handleConfirmedStatus = exports.getCurrentWeekStartDate = void 0;
const app_1 = require("../app");
const emitNotification_1 = require("../sockets/emitNotification");
const zoom_1 = require("../config/zoom");
const date_fns_1 = require("date-fns");
const getZoomAccessToken = () => __awaiter(void 0, void 0, void 0, function* () {
    const credentials = Buffer.from(`${zoom_1.ZOOM_CONFIG.clientId}:${zoom_1.ZOOM_CONFIG.clientSecret}`).toString('base64');
    const response = yield fetch('https://zoom.us/oauth/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'account_credentials',
            account_id: zoom_1.ZOOM_CONFIG.accountId,
        }),
    });
    if (!response.ok) {
        const errorData = yield response.json();
        throw new Error(`Failed to get Zoom access token: ${errorData.error_description || errorData.error}`);
    }
    const data = yield response.json();
    return data.access_token;
});
const generateMeetingPassword = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};
const createZoomMeeting = (meetingData) => __awaiter(void 0, void 0, void 0, function* () {
    const accessToken = yield getZoomAccessToken();
    const meetingRequest = {
        topic: meetingData.topic,
        type: 2,
        start_time: meetingData.startTime.toISOString(),
        duration: meetingData.duration,
        timezone: meetingData.timezone || 'UTC',
        password: generateMeetingPassword(),
        settings: {
            host_video: true,
            participant_video: true,
            join_before_host: false,
            mute_upon_entry: true,
            waiting_room: true,
            auto_recording: 'none',
            meeting_authentication: true,
            enforce_login: false,
            alternative_hosts: '',
            participant_can_start_meeting: false,
            waiting_room_settings: {
                participants_to_place_in_waiting_room: 3,
            }
        },
        host_email: meetingData.hostEmail,
        attendees: [
            {
                email: meetingData.participantEmail
            }
        ]
    };
    const response = yield fetch(`${zoom_1.ZOOM_CONFIG.apiBaseUrl}/users/me/meetings`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(meetingRequest),
    });
    if (!response.ok) {
        const errorData = yield response.json();
        throw new Error(`Failed to create Zoom meeting: ${errorData.message || 'Unknown error'}`);
    }
    return yield response.json();
});
const getCurrentWeekStartDate = () => {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
};
exports.getCurrentWeekStartDate = getCurrentWeekStartDate;
const handleConfirmedStatus = (res, bookingData, id, formattedDate, formattedTime) => __awaiter(void 0, void 0, void 0, function* () {
    if (bookingData.zoom_meeting_created) {
        const { data: updatedBooking, error: updateError } = yield app_1.supabase
            .from('slots_booking')
            .update({
            booking_status: 'confirmed',
            updated_at: new Date().toISOString()
        })
            .eq('id', id)
            .select()
            .single();
        if (updateError)
            throw new Error(`Failed to update booking: ${updateError.message}`);
        return res.status(200).json({
            success: true,
            message: 'Booking confirmed (existing Zoom meeting)',
            data: updatedBooking
        });
    }
    // Create new Zoom meeting
    const meetingStartTime = (0, date_fns_1.parseISO)(`${bookingData.meeting_date}T${bookingData.meeting_start_time}`);
    const meetingEndTime = (0, date_fns_1.parseISO)(`${bookingData.meeting_date}T${bookingData.meeting_end_time}`);
    const duration = (0, date_fns_1.differenceInMinutes)(meetingEndTime, meetingStartTime);
    const { data: buyerData } = yield app_1.supabase
        .from('profiles')
        .select('*')
        .eq('id', bookingData.buyer_id);
    const { data: sellerData } = yield app_1.supabase
        .from('profiles')
        .select('*')
        .eq('id', bookingData.seller_id);
    if (!buyerData || !sellerData) {
        throw new Error('Could not fetch buyer or seller information');
    }
    const zoomMeeting = yield createZoomMeeting({
        topic: `${bookingData.service_title} - 1:1 Consultation`,
        startTime: meetingStartTime,
        duration: duration,
        timezone: 'UTC',
        hostEmail: sellerData[0].email,
        participantEmail: buyerData[0].email
    });
    const { data: updatedBooking, error: updateError } = yield app_1.supabase
        .from('slots_booking')
        .update({
        booking_status: 'confirmed',
        zoom_meeting_id: zoomMeeting.id,
        zoom_join_url: zoomMeeting.join_url,
        zoom_password: zoomMeeting.password,
        zoom_host_url: zoomMeeting.host_url,
        zoom_meeting_created: true,
        meeting_status: 'scheduled',
        updated_at: new Date().toISOString()
    })
        .eq('id', id)
        .select()
        .single();
    if (updateError) {
        yield cleanupFailedZoomMeeting(zoomMeeting.id);
        throw new Error(`Failed to update booking: ${updateError.message}`);
    }
    // Send notifications
    yield sendConfirmationNotifications(bookingData, buyerData[0], sellerData[0], formattedDate, formattedTime, zoomMeeting);
    return res.status(200).json({
        success: true,
        message: 'Booking confirmed and Zoom meeting created',
        data: updatedBooking
    });
});
exports.handleConfirmedStatus = handleConfirmedStatus;
const handleCancelledStatus = (res, bookingData, id, status, formattedDate, formattedTime) => __awaiter(void 0, void 0, void 0, function* () {
    // Delete Zoom meeting if exists
    if (bookingData.zoom_meeting_created && bookingData.zoom_meeting_id) {
        try {
            const accessToken = yield getZoomAccessToken();
            yield fetch(`${zoom_1.ZOOM_CONFIG.apiBaseUrl}/meetings/${bookingData.zoom_meeting_id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });
        }
        catch (zoomError) {
            console.error('Failed to delete Zoom meeting:', zoomError);
        }
    }
    // Update booking status
    const { data: updatedBooking, error: updateError } = yield app_1.supabase
        .from('slots_booking')
        .update({
        booking_status: status,
        zoom_meeting_id: null,
        zoom_join_url: null,
        zoom_password: null,
        zoom_host_url: null,
        zoom_meeting_created: false,
        meeting_status: 'cancelled',
        updated_at: new Date().toISOString()
    })
        .eq('id', id)
        .select()
        .single();
    if (updateError)
        throw new Error(`Failed to update booking: ${updateError.message}`);
    // Send cancellation notifications
    yield sendCancellationNotifications(bookingData, status, formattedDate, formattedTime);
    return res.status(200).json({
        success: true,
        message: `Booking ${status} and marked as historical`,
        data: updatedBooking
    });
});
exports.handleCancelledStatus = handleCancelledStatus;
const handleCompletedStatus = (res, bookingData, id, status, formattedDate) => __awaiter(void 0, void 0, void 0, function* () {
    const { data: updatedBooking, error: updateError } = yield app_1.supabase
        .from('slots_booking')
        .update({
        booking_status: status,
        meeting_status: status,
        updated_at: new Date().toISOString(),
        is_historical: true
    })
        .eq('id', id)
        .select()
        .single();
    if (updateError)
        throw new Error(`Failed to update booking status: ${updateError.message}`);
    // Send completion notifications
    yield sendCompletionNotifications(bookingData, status, formattedDate);
    return res.status(200).json({
        success: true,
        message: `Booking marked as ${status}`,
        data: updatedBooking
    });
});
exports.handleCompletedStatus = handleCompletedStatus;
const handleOtherStatus = (res, bookingData, id, status) => __awaiter(void 0, void 0, void 0, function* () {
    const { data: updatedBooking, error: updateError } = yield app_1.supabase
        .from('slots_booking')
        .update({
        booking_status: status,
        updated_at: new Date().toISOString(),
        is_historical: status === 'completed' || status === 'no_show'
    })
        .eq('id', id)
        .select()
        .single();
    if (updateError)
        throw new Error(`Failed to update booking status: ${updateError.message}`);
    return res.status(200).json({
        success: true,
        message: 'Booking status updated',
        data: updatedBooking
    });
});
exports.handleOtherStatus = handleOtherStatus;
const sendConfirmationNotifications = (bookingData, buyerData, sellerData, formattedDate, formattedTime, zoomMeeting) => __awaiter(void 0, void 0, void 0, function* () {
    // Notify buyer
    yield (0, emitNotification_1.sendNotification)({
        recipientEmail: buyerData.email,
        recipientUserId: buyerData.id,
        actorUserId: null,
        threadId: null,
        message: `Your booking with _**${bookingData.seller_name}**_ for **"${bookingData.service_title}"** has been confirmed for _${formattedDate}_ at **${formattedTime}**.`,
        type: 'slot_confirmation',
        metadata: {
            booking_id: bookingData.id,
            service_title: bookingData.service_title,
            meeting_date: bookingData.meeting_date,
            meeting_time: bookingData.meeting_start_time,
            seller_name: bookingData.seller_name,
            zoom_join_url: zoomMeeting.join_url,
            zoom_password: zoomMeeting.password,
            formatted_date: formattedDate,
            formatted_time: formattedTime
        }
    });
    // Notify seller
    yield (0, emitNotification_1.sendNotification)({
        recipientEmail: sellerData.email,
        recipientUserId: sellerData.id,
        actorUserId: null,
        threadId: null,
        message: `You confirmed a booking with _**${bookingData.buyer_name}**_ for **"${bookingData.service_title}"** on _${formattedDate}_ at **${formattedTime}**.`,
        type: 'slot_confirmation_host',
        metadata: {
            booking_id: bookingData.id,
            service_title: bookingData.service_title,
            meeting_date: bookingData.meeting_date,
            meeting_time: bookingData.meeting_start_time,
            buyer_name: bookingData.buyer_name,
            zoom_host_url: zoomMeeting.host_url,
            formatted_date: formattedDate,
            formatted_time: formattedTime
        }
    });
});
const sendCancellationNotifications = (bookingData, status, formattedDate, formattedTime) => __awaiter(void 0, void 0, void 0, function* () {
    // Notify buyer
    const { data: buyerData } = yield app_1.supabase
        .from('profiles')
        .select('*')
        .eq('id', bookingData.buyer_id)
        .single();
    if (buyerData) {
        yield (0, emitNotification_1.sendNotification)({
            recipientEmail: buyerData.email,
            recipientUserId: buyerData.id,
            actorUserId: null,
            threadId: null,
            message: `Your booking with _**${bookingData.seller_name}**_ for **"${bookingData.service_title}"** on _${formattedDate}_ at **${formattedTime}** has been ${status}.`,
            type: 'slot_cancellation',
            metadata: {
                booking_id: bookingData.id,
                service_title: bookingData.service_title,
                meeting_date: bookingData.meeting_date,
                meeting_time: bookingData.meeting_start_time,
                seller_name: bookingData.seller_name,
                formatted_date: formattedDate,
                formatted_time: formattedTime,
                cancellation_reason: status === 'declined' ? 'declined by seller' : 'cancelled'
            }
        });
    }
    if (status === 'cancelled') {
        const { data: sellerData } = yield app_1.supabase
            .from('profiles')
            .select('*')
            .eq('id', bookingData.seller_id)
            .single();
        if (sellerData) {
            yield (0, emitNotification_1.sendNotification)({
                recipientEmail: sellerData.email,
                recipientUserId: sellerData.id,
                actorUserId: null,
                threadId: null,
                message: `Booking with _**${bookingData.buyer_name}**_ for **"${bookingData.service_title}"** on _${formattedDate}_ at **${formattedTime}** has been cancelled.`,
                type: 'slot_cancellation_host',
                metadata: {
                    booking_id: bookingData.id,
                    service_title: bookingData.service_title,
                    meeting_date: bookingData.meeting_date,
                    meeting_time: bookingData.meeting_start_time,
                    buyer_name: bookingData.buyer_name,
                    formatted_date: formattedDate,
                    formatted_time: formattedTime
                }
            });
        }
    }
});
const sendCompletionNotifications = (bookingData, status, formattedDate) => __awaiter(void 0, void 0, void 0, function* () {
    const { data: buyerData } = yield app_1.supabase
        .from('profiles')
        .select('*')
        .eq('id', bookingData.buyer_id)
        .single();
    if (buyerData) {
        yield (0, emitNotification_1.sendNotification)({
            recipientEmail: buyerData.email,
            recipientUserId: buyerData.id,
            actorUserId: null,
            threadId: null,
            message: `Your session with _**${bookingData.seller_name}**_ on _${formattedDate}_ has been marked as **${status}**.`,
            type: 'slot_completion',
            metadata: {
                booking_id: bookingData.id,
                service_title: bookingData.service_title,
                meeting_date: bookingData.meeting_date,
                seller_name: bookingData.seller_name,
                status: status,
                formatted_date: formattedDate
            }
        });
    }
    // Notify seller
    const { data: sellerData } = yield app_1.supabase
        .from('profiles')
        .select('*')
        .eq('id', bookingData.seller_id)
        .single();
    if (sellerData) {
        yield (0, emitNotification_1.sendNotification)({
            recipientEmail: sellerData.email,
            recipientUserId: sellerData.id,
            actorUserId: null,
            threadId: null,
            message: `Your session with _**${bookingData.buyer_name}**_ on _${formattedDate}_ has been marked as **${status}**.`,
            type: 'slot_completion_host',
            metadata: {
                booking_id: bookingData.id,
                service_title: bookingData.service_title,
                meeting_date: bookingData.meeting_date,
                buyer_name: bookingData.buyer_name,
                status: status,
                formatted_date: formattedDate
            }
        });
    }
});
const cleanupFailedZoomMeeting = (meetingId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const accessToken = yield getZoomAccessToken();
        yield fetch(`${zoom_1.ZOOM_CONFIG.apiBaseUrl}/meetings/${meetingId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
    }
    catch (cleanupError) {
        console.error('Failed to cleanup Zoom meeting after database error:', cleanupError);
    }
});
const handleErrorResponse = (res, error) => {
    if (error instanceof Error && error.message.includes('Zoom')) {
        return res.status(503).json({
            success: false,
            error: 'Failed to create meeting room',
            details: 'Meeting scheduling service is temporarily unavailable'
        });
    }
    return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
    });
};
exports.handleErrorResponse = handleErrorResponse;
