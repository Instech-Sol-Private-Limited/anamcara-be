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
exports.handleZoomWebhook = void 0;
const app_1 = require("../app");
const zoomverification_middleware_1 = require("../middleware/zoomverification.middleware");
const date_fns_1 = require("date-fns");
const handleZoomWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const isValid = (0, zoomverification_middleware_1.verifyZoomWebhook)(req);
        if (!isValid)
            return res.status(401).send('Unauthorized');
        const event = req.body.event;
        const payload = req.body.payload;
        const meetingId = payload.object.id;
        const { data: bookingData, error: bookingError } = yield app_1.supabase
            .from('slots_booking')
            .select('*')
            .eq('zoom_meeting_id', meetingId)
            .single();
        if (bookingError || !bookingData) {
            console.warn(`No booking found for Zoom meeting ${meetingId}`);
            return res.status(200).send();
        }
        // Find existing meeting track record
        let { data: meetingTrack, error: trackError } = yield app_1.supabase
            .from('meetings_track')
            .select('*')
            .eq('zoom_meeting_id', meetingId)
            .single();
        // If no record exists, create one with all required fields
        if (!meetingTrack) {
            const currentTime = new Date().toISOString();
            const { data: newMeeting, error: insertError } = yield app_1.supabase
                .from('meetings_track')
                .insert({
                zoom_meeting_id: meetingId,
                booking_id: bookingData.id,
                event_type: 'meeting_created',
                event_time: currentTime, // Required field
                meeting_start_time: null,
                meeting_end_time: null,
                participant_count: 0,
                participant_details: [],
                created_at: currentTime,
                updated_at: currentTime
            })
                .select()
                .single();
            if (insertError || !newMeeting) {
                throw new Error(`Failed to create meeting track record: ${insertError === null || insertError === void 0 ? void 0 : insertError.message}`);
            }
            meetingTrack = newMeeting;
        }
        // Now we're sure meetingTrack exists with all required fields
        switch (event) {
            case 'meeting.started':
                yield handleMeetingStarted(meetingTrack.id, meetingId, bookingData.id, payload);
                break;
            case 'meeting.ended':
                yield handleMeetingEnded(meetingTrack.id, meetingId, bookingData.id, payload);
                break;
            case 'meeting.participant_joined':
                yield handleParticipantJoined(meetingTrack.id, meetingId, bookingData.id, payload);
                break;
            case 'meeting.participant_left':
                yield handleParticipantLeft(meetingTrack.id, meetingId, bookingData.id, payload);
                break;
            default:
                console.log(`Unhandled event type: ${event}`);
        }
        res.status(200).send();
    }
    catch (error) {
        console.error('Error handling Zoom webhook:', error);
        res.status(500).send('Internal server error');
    }
});
exports.handleZoomWebhook = handleZoomWebhook;
const handleMeetingStarted = (trackId, meetingId, bookingId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const startTime = new Date().toISOString();
    const { error } = yield app_1.supabase
        .from('meetings_track')
        .update({
        event_type: 'meeting_started',
        meeting_start_time: startTime,
        event_time: startTime,
        // participant_count: 1, // Host joins automatically
        updated_at: startTime
    })
        .eq('id', trackId);
    if (error)
        throw error;
    // Update booking status
    yield app_1.supabase
        .from('slots_booking')
        .update({
        meeting_status: 'in_progress',
        updated_at: startTime
    })
        .eq('id', bookingId);
});
const handleMeetingEnded = (trackId, meetingId, bookingId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const endTime = new Date().toISOString();
    const { data: meetingTrack } = yield app_1.supabase
        .from('meetings_track')
        .select('*')
        .eq('id', trackId)
        .single();
    const { data: booking } = yield app_1.supabase
        .from('slots_booking')
        .select('*')
        .eq('id', bookingId)
        .single();
    if (!meetingTrack || !booking) {
        throw new Error('Meeting or booking record not found');
    }
    // const hostJoined = meetingTrack.participant_details?.some(
    //     (p: any) => p.email === booking.seller_email
    // );
    // const buyerJoined = meetingTrack.participant_details?.some(
    //     (p: any) => p.email === booking.buyer_email
    // );
    // const meetingValid = hostJoined && buyerJoined;
    const duration = (meetingTrack === null || meetingTrack === void 0 ? void 0 : meetingTrack.meeting_start_time)
        ? (0, date_fns_1.differenceInMinutes)(new Date(endTime), new Date(meetingTrack.meeting_start_time))
        : 0;
    const durationValid = duration >= (booking.duration_minutes * 0.5);
    const { error: trackError } = yield app_1.supabase
        .from('meetings_track')
        .update({
        event_type: 'meeting_ended',
        meeting_end_time: endTime,
        event_time: endTime,
        duration: duration,
        updated_at: endTime,
    })
        .eq('id', trackId);
    if (trackError)
        throw trackError;
    const { error: bookingError } = yield app_1.supabase
        .from('slots_booking')
        .update({
        meeting_status: 'completed',
        booking_status: 'completed',
        updated_at: endTime,
    })
        .eq('id', bookingId);
    if (bookingError)
        throw bookingError;
    // meetingValid &&
    if (durationValid) {
        const payoutDate = new Date();
        payoutDate.setDate(payoutDate.getDate() + 7);
        const { error: paymentError } = yield app_1.supabase
            .from('pending_payments')
            .insert({
            booking_id: bookingId,
            seller_id: booking.seller_id,
            amount: booking.price,
            meeting_end_time: endTime,
            payout_date: payoutDate.toISOString(),
            status: 'pending'
        });
        if (paymentError)
            throw paymentError;
    }
    else {
        yield handleRefund(booking);
    }
});
const handleParticipantJoined = (trackId, meetingId, bookingId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const participant = payload.object.participant;
    const joinTime = new Date().toISOString();
    // Get current participant details
    const { data: meetingTrack } = yield app_1.supabase
        .from('meetings_track')
        .select('participant_count, participant_details')
        .eq('id', trackId)
        .single();
    let participants = (meetingTrack === null || meetingTrack === void 0 ? void 0 : meetingTrack.participant_count) || 0;
    let participantDetails = (meetingTrack === null || meetingTrack === void 0 ? void 0 : meetingTrack.participant_details) || [];
    // Check if participant already exists
    const existingParticipant = participantDetails.find((p) => p.user_id === participant.user_id);
    if (!existingParticipant) {
        participants++;
        participantDetails.push({
            user_id: participant.user_id,
            user_name: participant.user_name,
            email: participant.email,
            join_time: participant.join_time || joinTime,
            left_time: null
        });
    }
    yield app_1.supabase
        .from('meetings_track')
        .update({
        event_type: 'participant_joined',
        event_time: joinTime,
        participant_count: participants,
        participant_details: participantDetails,
        updated_at: joinTime
    })
        .eq('id', trackId);
});
const handleParticipantLeft = (trackId, meetingId, bookingId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const participant = payload.object.participant;
    const leftTime = new Date().toISOString();
    // Get current participant details
    const { data: meetingTrack } = yield app_1.supabase
        .from('meetings_track')
        .select('participant_count, participant_details')
        .eq('id', trackId)
        .single();
    const participantDetails = (meetingTrack === null || meetingTrack === void 0 ? void 0 : meetingTrack.participant_details) || [];
    // Update participant left time
    const updatedDetails = participantDetails.map((p) => {
        if (p.user_id === participant.user_id) {
            return Object.assign(Object.assign({}, p), { left_time: participant.leave_time || leftTime });
        }
        return p;
    });
    yield app_1.supabase
        .from('meetings_track')
        .update({
        event_type: 'participant_left',
        event_time: leftTime,
        participant_details: updatedDetails,
        updated_at: leftTime
    })
        .eq('id', trackId);
});
const handleRefund = (booking) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: currentCoins, error: fetchError } = yield app_1.supabase
            .from('anamcoins')
            .select('available_coins, spent_coins')
            .eq('user_id', booking.buyer_id)
            .single();
        if (fetchError || !currentCoins) {
            throw fetchError || new Error('Could not fetch current coin balance');
        }
        const { error: coinsError } = yield app_1.supabase
            .from('anamcoins')
            .update({
            available_coins: currentCoins.available_coins + booking.price,
            spent_coins: currentCoins.spent_coins - booking.price,
            updated_at: new Date().toISOString()
        })
            .eq('user_id', booking.buyer_id);
        if (coinsError)
            throw coinsError;
        const { error: bookingError } = yield app_1.supabase
            .from('slots_booking')
            .update({
            payment_status: 'refunded',
            updated_at: new Date().toISOString()
        })
            .eq('id', booking.id);
        if (bookingError)
            throw bookingError;
    }
    catch (error) {
        console.error(`Failed to process refund for booking ${booking.id}:`, error);
        throw error;
    }
});
