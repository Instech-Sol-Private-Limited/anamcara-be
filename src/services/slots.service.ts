import cron from 'node-cron';
import { supabase } from '../app';
import { sendNotification } from '../sockets/emitNotification';
import { ZOOM_CONFIG } from '../config/zoom';
import { Response } from 'express';
import { differenceInMinutes, parseISO } from 'date-fns';


const getZoomAccessToken = async (): Promise<string> => {
    const credentials = Buffer.from(
        `${ZOOM_CONFIG.clientId}:${ZOOM_CONFIG.clientSecret}`
    ).toString('base64');

    const response = await fetch('https://zoom.us/oauth/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'account_credentials',
            account_id: ZOOM_CONFIG.accountId,
        }),
    });


    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to get Zoom access token: ${errorData.error_description || errorData.error}`);
    }

    const data = await response.json();
    return data.access_token;
};

const generateMeetingPassword = (): string => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const createZoomMeeting = async (meetingData: {
    topic: string;
    startTime: Date;
    duration: number;
    timezone?: string;
    hostEmail: string;
    participantEmail: string;
}) => {
    const accessToken = await getZoomAccessToken();

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
            join_before_host: true,
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
    
    

    const response = await fetch(`${ZOOM_CONFIG.apiBaseUrl}/users/me/meetings`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(meetingRequest),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create Zoom meeting: ${errorData.message || 'Unknown error'}`);
    }

    return await response.json();
};

const getCurrentWeekStartDate = (): Date => {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
};

const handleConfirmedStatus = async (
    res: Response,
    bookingData: any,
    id: string,
    formattedDate: string,
    formattedTime: string
) => {
    if (bookingData.zoom_meeting_created) {
        const { data: updatedBooking, error: updateError } = await supabase
            .from('slots_booking')
            .update({
                booking_status: 'confirmed',
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw new Error(`Failed to update booking: ${updateError.message}`);

        return res.status(200).json({
            success: true,
            message: 'Booking confirmed (existing Zoom meeting)',
            data: updatedBooking
        });
    }

    // Create new Zoom meeting
    const meetingStartTime = parseISO(`${bookingData.meeting_date}T${bookingData.meeting_start_time}`);
    const meetingEndTime = parseISO(`${bookingData.meeting_date}T${bookingData.meeting_end_time}`);
    const duration = differenceInMinutes(meetingEndTime, meetingStartTime);

    const { data: buyerData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', bookingData.buyer_id);
        
    const { data: sellerData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', bookingData.seller_id);
  
    
    if (!buyerData || !sellerData) {
        throw new Error('Could not fetch buyer or seller information');
    }

    const zoomMeeting = await createZoomMeeting({
        topic: `${bookingData.service_title} - 1:1 Consultation`,
        startTime: meetingStartTime,
        duration: duration,
        timezone: 'UTC',
        hostEmail: sellerData[0].email,
        participantEmail: buyerData[0].email
    });

    

    const { data: updatedBooking, error: updateError } = await supabase
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
        await cleanupFailedZoomMeeting(zoomMeeting.id);
        throw new Error(`Failed to update booking: ${updateError.message}`);
    }

    // Send notifications
    await sendConfirmationNotifications(
        bookingData,
        buyerData[0],
        sellerData[0],
        formattedDate,
        formattedTime,
        zoomMeeting
    );

    return res.status(200).json({
        success: true,
        message: 'Booking confirmed and Zoom meeting created',
        data: updatedBooking
    });
};

const handleCancelledStatus = async (
    res: Response,
    bookingData: any,
    id: string,
    status: string,
    formattedDate: string,
    formattedTime: string
) => {
    // Delete Zoom meeting if exists
    if (bookingData.zoom_meeting_created && bookingData.zoom_meeting_id) {
        try {
            const accessToken = await getZoomAccessToken();
            await fetch(`${ZOOM_CONFIG.apiBaseUrl}/meetings/${bookingData.zoom_meeting_id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });
        } catch (zoomError) {
            console.error('Failed to delete Zoom meeting:', zoomError);
        }
    }

    // Update booking status
    const { data: updatedBooking, error: updateError } = await supabase
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

    if (updateError) throw new Error(`Failed to update booking: ${updateError.message}`);

    // Send cancellation notifications
    await sendCancellationNotifications(bookingData, status, formattedDate, formattedTime);

    return res.status(200).json({
        success: true,
        message: `Booking ${status} and marked as historical`,
        data: updatedBooking
    });
};

const handleCompletedStatus = async (
    res: Response,
    bookingData: any,
    id: string,
    status: string,
    formattedDate: string
) => {
    const { data: updatedBooking, error: updateError } = await supabase
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

    if (updateError) throw new Error(`Failed to update booking status: ${updateError.message}`);

    // Send completion notifications
    await sendCompletionNotifications(bookingData, status, formattedDate);

    return res.status(200).json({
        success: true,
        message: `Booking marked as ${status}`,
        data: updatedBooking
    });
};

const handleOtherStatus = async (
    res: Response,
    bookingData: any,
    id: string,
    status: string
) => {
    const { data: updatedBooking, error: updateError } = await supabase
        .from('slots_booking')
        .update({
            booking_status: status,
            updated_at: new Date().toISOString(),
            is_historical: status === 'completed' || status === 'no_show'
        })
        .eq('id', id)
        .select()
        .single();

    if (updateError) throw new Error(`Failed to update booking status: ${updateError.message}`);

    return res.status(200).json({
        success: true,
        message: 'Booking status updated',
        data: updatedBooking
    });
};

const sendConfirmationNotifications = async (
    bookingData: any,
    buyerData: any,
    sellerData: any,
    formattedDate: string,
    formattedTime: string,
    zoomMeeting: any
) => {
    // Notify buyer
    await sendNotification({
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
    await sendNotification({
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
};

const sendCancellationNotifications = async (
    bookingData: any,
    status: string,
    formattedDate: string,
    formattedTime: string
) => {
    // Notify buyer
    const { data: buyerData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', bookingData.buyer_id)
        .single();

    if (buyerData) {
        await sendNotification({
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
        const { data: sellerData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', bookingData.seller_id)
            .single();

        if (sellerData) {
            await sendNotification({
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
};

const sendCompletionNotifications = async (
    bookingData: any,
    status: string,
    formattedDate: string
) => {
    const { data: buyerData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', bookingData.buyer_id)
        .single();

    if (buyerData) {
        await sendNotification({
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
    const { data: sellerData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', bookingData.seller_id)
        .single();

    if (sellerData) {
        await sendNotification({
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
};

const cleanupFailedZoomMeeting = async (meetingId: string) => {
    try {
        const accessToken = await getZoomAccessToken();
        await fetch(`${ZOOM_CONFIG.apiBaseUrl}/meetings/${meetingId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
    } catch (cleanupError) {
        console.error('Failed to cleanup Zoom meeting after database error:', cleanupError);
    }
};

const handleErrorResponse = (res: Response, error: unknown) => {
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

// const scheduleMeetingCompletionCheck = async (bookingId: string, meetingDate: string, meetingEndTime: string) => {
//     try {
//         const [hours, minutes] = meetingEndTime.split(':').map(Number);
//         const meetingEndDateTime = new Date(meetingDate);
//         meetingEndDateTime.setHours(hours, minutes, 0, 0);
//         const now = new Date();
//         const delayMs = meetingEndDateTime.getTime() - now.getTime();

//         if (delayMs > 0) {
//             await supabase
//                 .from('scheduled_checks')
//                 .insert({
//                     booking_id: bookingId,
//                     check_time: meetingEndDateTime.toISOString()
//                 });

//             setTimeout(() => {
//                 markMeetingAsCompleted(bookingId);
//             }, delayMs);
//         } else {
//             await markMeetingAsCompleted(bookingId);
//         }
//     } catch (error) {
//         console.error('Error scheduling meeting check:', error);
//     }
// };

// const markMeetingAsCompleted = async (bookingId: string) => {
//     try {
//         await supabase
//             .from('slots_booking')
//             .update({
//                 meeting_status: 'completed',
//                 updated_at: new Date().toISOString()
//             })
//             .eq('id', bookingId);
//     } catch (error) {
//         console.error('Error marking meeting as completed:', error);
//     }
// };

// cron.schedule('0 * * * *', async () => {
//     try {
//         const now = new Date().toISOString();

//         const { data: missedChecks, error } = await supabase
//             .from('scheduled_checks')
//             .select('booking_id')
//             .lte('check_time', now);

//         if (error) throw error;

//         if (missedChecks && missedChecks.length > 0) {
//             for (const check of missedChecks) {
//                 await markMeetingAsCompleted(check.booking_id);
//             }
//         }
//     } catch (error) {
//         console.error('Error in backup cron job:', error);
//     }
// });

export {
    // scheduleMeetingCompletionCheck,
    getCurrentWeekStartDate,
    handleConfirmedStatus,
    handleErrorResponse,
    handleCancelledStatus,
    handleCompletedStatus,
    handleOtherStatus,
}