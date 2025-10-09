import { Request, Response } from 'express';
import { supabase } from '../app';
import { sendNotification } from '../sockets/emitNotification';
import {
    getCurrentWeekStartDate,
    handleConfirmedStatus,
    handleErrorResponse,
    handleCancelledStatus,
    handleCompletedStatus,
    handleOtherStatus,
} from '../services/slots.service'
import {
    formatDateToYYYYMMDD,
    isValidAvailability,
    formatTimeToAMPM,
    formatDateToReadable,
} from '../services/index.service';

interface DayAvailability {
    enabled: boolean;
    slots: TimeSlot[];
}

interface TimeSlot {
    id: string;
    start: string;
    end: string;
    isNew?: boolean;
}

interface Availability {
    Monday: DayAvailability;
    Tuesday: DayAvailability;
    Wednesday: DayAvailability;
    Thursday: DayAvailability;
    Friday: DayAvailability;
    Saturday: DayAvailability;
    Sunday: DayAvailability;
}

const DEFAULT_AVAILABILITY: Availability = {
    Monday: { enabled: false, slots: [] },
    Tuesday: { enabled: false, slots: [] },
    Wednesday: { enabled: false, slots: [] },
    Thursday: { enabled: false, slots: [] },
    Friday: { enabled: false, slots: [] },
    Saturday: { enabled: false, slots: [] },
    Sunday: { enabled: false, slots: [] }
};

export const getAvailability = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const weekStart = formatDateToYYYYMMDD(getCurrentWeekStartDate());

        const today = new Date();
        const isMonday = today.getDay() === 1;

        const { data: existing, error: fetchError } = await supabase
            .from('user_availability')
            .select('availability')
            .eq('user_id', userId)
            .eq('week_start_date', weekStart)
            .maybeSingle();

        if (fetchError) throw fetchError;

        if ((isMonday && !existing) || !existing) {
            const { data: newAvailability, error: upsertError } = await supabase
                .from('user_availability')
                .upsert({
                    user_id: userId,
                    week_start_date: weekStart,
                    availability: DEFAULT_AVAILABILITY
                }, {
                    onConflict: 'user_id,week_start_date'
                })
                .select('availability')
                .single();

            if (upsertError) throw upsertError;
            return res.json(newAvailability.availability);
        }

        res.json(existing.availability);
    } catch (error) {
        console.error('Error fetching availability:', error);
        res.status(500).json({ error: 'Failed to fetch availability' });
    }
};

export const updateAvailability = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { availability } = req.body;
        if (!availability) {
            res.status(400).json({ error: 'Availability data is required' });
            return;
        }

        if (!isValidAvailability(availability)) {
            res.status(400).json({ error: 'Invalid availability structure' });
            return;
        }

        const weekStart = formatDateToYYYYMMDD(getCurrentWeekStartDate());

        const { data: userData, error: userError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();

        if (userError || !userData) {
            const { error: createUserError } = await supabase
                .from('profiles')
                .insert({
                    id: userId,
                    created_at: new Date().toISOString()
                });

            if (createUserError) throw createUserError;
        }

        const { data, error } = await supabase
            .from('user_availability')
            .upsert({
                user_id: userId,
                week_start_date: weekStart,
                availability,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,week_start_date'
            })
            .select('availability')
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data: data.availability,
            message: data ? 'Availability updated' : 'New availability created'
        });

    } catch (error) {
        console.error('Error in updateAvailability:', error);
        res.status(500).json({
            error: 'Failed to process availability',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

export const getUserSlots = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = req.params?.userid;

        const weekStart = formatDateToYYYYMMDD(getCurrentWeekStartDate());

        const today = new Date();
        const isMonday = today.getDay() === 1;

        const { data: existing, error: fetchError } = await supabase
            .from('user_availability')
            .select('availability')
            .eq('user_id', userId)
            .eq('week_start_date', weekStart)
            .maybeSingle();

        if (fetchError) throw fetchError;

        if ((isMonday && !existing) || !existing) {
            const { data: newAvailability, error: upsertError } = await supabase
                .from('user_availability')
                .upsert({
                    user_id: userId,
                    week_start_date: weekStart,
                    availability: DEFAULT_AVAILABILITY
                }, {
                    onConflict: 'user_id,week_start_date'
                })
                .select('availability')
                .single();

            if (upsertError) throw upsertError;
            return res.json(newAvailability.availability);
        }

        res.json(existing.availability);
    } catch (error) {
        console.error('Error fetching availability:', error);
        res.status(500).json({ error: 'Failed to fetch availability' });
    }
};

export const bookingASlot = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            service_id,
            seller_id,
            buyer_id,
            meeting_date,
            meeting_start_time,
            meeting_end_time,
            duration_minutes,
            price,
            service_title,
            seller_name,
            buyer_name
        } = req.body;

        if (!service_id || !seller_id || !buyer_id || !meeting_date ||
            !meeting_start_time || !meeting_end_time || !duration_minutes ||
            !price || !service_title || !seller_name || !buyer_name) {
            return res.status(400).json({ error: 'Missing required booking fields' });
        }

        const parseTime = (timeStr: string) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const newStart = parseTime(meeting_start_time);
        const newEnd = parseTime(meeting_end_time);

        const { data: existingBookings, error: bookingCheckError } = await supabase
            .from('slots_booking')
            .select('meeting_start_time, meeting_end_time')
            .eq('seller_id', seller_id)
            .eq('meeting_date', meeting_date)
            .or('booking_status.eq.pending,booking_status.eq.confirmed');

        if (bookingCheckError) throw bookingCheckError;

        if (existingBookings && existingBookings.length > 0) {
            const hasConflict = existingBookings.some(booking => {
                const existingStart = parseTime(booking.meeting_start_time);
                const existingEnd = parseTime(booking.meeting_end_time);

                return (
                    (newStart >= existingStart && newStart < existingEnd) ||
                    (newEnd > existingStart && newEnd <= existingEnd) ||
                    (newStart <= existingStart && newEnd >= existingEnd)
                );
            });

            if (hasConflict) {
                return res.status(409).json({
                    error: 'Time slot overlaps with an existing booking',
                    details: 'Please choose a different time slot'
                });
            }
        }

        const { data: coinsData, error: coinsError } = await supabase
            .from('anamcoins')
            .select('available_coins, spent_coins')
            .eq('user_id', buyer_id)
            .single();

        if (coinsError) throw coinsError;
        if (!coinsData) {
            return res.status(400).json({ error: 'User anamcoins account not found' });
        }

        const availableCoins = coinsData.available_coins;
        if (availableCoins < price) {
            return res.status(400).json({ error: 'Insufficient anamcoins' });
        }

        const { error: deductError } = await supabase
            .from('anamcoins')
            .update({
                available_coins: availableCoins - price,
                spent_coins: coinsData.spent_coins + price,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', buyer_id);

        if (deductError) throw deductError;

        const { data: bookingData, error: bookingError } = await supabase
            .from('slots_booking')
            .insert({
                service_id,
                seller_id,
                buyer_id,
                meeting_date,
                meeting_start_time,
                meeting_end_time,
                duration_minutes,
                price,
                service_title,
                seller_name,
                buyer_name,
                booking_status: 'pending',
                meeting_status: 'not_scheduled',
                payment_status: 'paid',
                zoom_meeting_created: false
            })
            .select()
            .single();

        if (bookingError) throw bookingError;

        // await scheduleMeetingCompletionCheck(bookingData.id, meeting_date, meeting_end_time);

        const { data: sellerData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', bookingData.seller_id);

        if (!sellerData) {
            throw new Error('Could not fetch buyer or seller information');
        }

        const formattedDate = formatDateToReadable(bookingData.meeting_date);
        const formattedTime = formatTimeToAMPM(bookingData.meeting_start_time);

        await sendNotification({
            recipientEmail: sellerData[0].email,
            recipientUserId: seller_id,
            actorUserId: null,
            threadId: null,
            message: `You have received a new booking request from _${bookingData.buyer_name}_ for **"${bookingData.service_title}"** on _${formattedDate}_ at **${formattedTime}**.`,
            type: 'slot_booking',
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

        const { data: buyerData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', bookingData.buyer_id);

        if (buyerData && buyerData.length > 0) {
            await sendNotification({
                recipientEmail: buyerData[0].email,
                recipientUserId: buyer_id,
                actorUserId: null,
                threadId: null,
                message: `Your booking request for **"${bookingData.service_title}"** with _**${bookingData.seller_name}**_ on _${formattedDate}_ at **${formattedTime}** has been submitted successfully.`,
                type: 'slot_booking_confirmation',
                metadata: {
                    booking_id: bookingData.id,
                    service_title: bookingData.service_title,
                    meeting_date: bookingData.meeting_date,
                    meeting_time: bookingData.meeting_start_time,
                    seller_name: bookingData.seller_name,
                    formatted_date: formattedDate,
                    formatted_time: formattedTime
                }
            });
        }

        res.status(201).json({
            message: 'Meeting request sent to seller successfully.',
            booking: bookingData
        });

    } catch (error: any) {
        console.error('Error requesting a slot:', error);
        res.status(500).json({
            error: 'Failed to request a meeting slot',
            details: error.message
        });
    }
};

export const getBookedSlots = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.id

        const currentDate = new Date().toISOString().split('T')[0];

        const { data: slotsData, error: slotsError } = await supabase
            .from('slots_booking')
            .select(`*`)
            .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
            .gte('meeting_date', currentDate)
            .order('meeting_date', { ascending: true })
            .order('meeting_start_time', { ascending: true })
            .limit(20);

        if (slotsError) {
            throw slotsError;
        }

        // Enhance response with user role for each booking
        const enhancedSlots = slotsData?.map(slot => ({
            ...slot,
            user_role: slot.seller_id === userId ? 'seller' : 'buyer',
            is_upcoming: new Date(`${slot.meeting_date}T${slot.meeting_end_time}`) > new Date()
        }));

        res.status(200).json({
            success: true,
            data: enhancedSlots,
            count: enhancedSlots?.length || 0
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error fetching booked slots:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch booked slots',
            details: errorMessage
        });
    }
};

export const updateBookingStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id, status } = req.body;

        // Fetch booking data
        const { data: bookingData, error: fetchError } = await supabase
            .from('slots_booking')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !bookingData) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found'
            });
        }

        // Format date/time for notifications
        const formattedDate = formatDateToReadable(bookingData.meeting_date);
        const formattedTime = formatTimeToAMPM(bookingData.meeting_start_time);

        // Handle different status updates
        switch (status) {
            case 'confirmed':
                return await handleConfirmedStatus(res, bookingData, id, formattedDate, formattedTime);
            case 'cancelled':
            case 'declined':
                return await handleCancelledStatus(res, bookingData, id, status, formattedDate, formattedTime);
            case 'completed':
            case 'no_show':
                return await handleCompletedStatus(res, bookingData, id, status, formattedDate);
            default:
                return await handleOtherStatus(res, bookingData, id, status);
        }
    } catch (error) {
        console.error('Error updating booking status:', error);
        handleErrorResponse(res, error);
    }
};