import { Request, Response } from 'express';
import { supabase } from '../app';

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

// Zoom API Configuration
const ZOOM_CONFIG = {
    accountId: process.env.ZOOM_ACCOUNT_ID!,
    clientId: process.env.ZOOM_CLIENT_ID!,
    clientSecret: process.env.ZOOM_CLIENT_SECRET!,
    apiBaseUrl: 'https://api.zoom.us/v2'
};

// Zoom API Functions
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
            join_before_host: false,
            mute_upon_entry: true,
            waiting_room: true,
            auto_recording: 'none',
            meeting_authentication: true,
            breakout_room: {
                enable: false
            },
            alternative_hosts: ''
        },

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

const generateBrandedLink = (zoomUrl: string) => {
    const brandedDomain = 'meet.anamcara.ai';
    const meetingId = zoomUrl.split('/j/')[1];
    return `https://${brandedDomain}/join/${meetingId}`;
};

// Helper Functions
const getCurrentWeekStartDate = (): Date => {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
};

const formatDateToYYYYMMDD = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

const calculateDuration = (startTime: string, endTime: string): number => {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;

    return endTotalMinutes - startTotalMinutes;
};

const parseDateAndTime = (dateStr: string, timeStr: string): Date => {
    const date = new Date(dateStr);
    const [hours, minutes] = timeStr.split(':').map(Number);

    date.setHours(hours, minutes, 0, 0);
    return date;
};

const validateBookingRequest = (data: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!data.date) errors.push('Date is required');
    if (!data.slot || !data.slot.start || !data.slot.end) errors.push('Valid time slot is required');
    if (!data.name) errors.push('Seller name is required');
    if (typeof data.price !== 'number' || data.price < 0) errors.push('Valid price is required');
    if (!data.title) errors.push('Service title is required');
    if (!data.id) errors.push('Service ID is required');

    // Validate date format
    if (data.date && isNaN(Date.parse(data.date))) {
        errors.push('Invalid date format');
    }

    // Validate time format
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (data.slot?.start && !timeRegex.test(data.slot.start)) {
        errors.push('Invalid start time format');
    }
    if (data.slot?.end && !timeRegex.test(data.slot.end)) {
        errors.push('Invalid end time format');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

const isValidAvailability = (availability: any): boolean => {
    try {
        const requiredDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        if (!requiredDays.every(day => day in availability)) {
            return false;
        }

        for (const day of requiredDays) {
            const dayAvailability = availability[day];
            if (typeof dayAvailability.enabled !== 'boolean') return false;

            if (!Array.isArray(dayAvailability.slots)) return false;

            for (const slot of dayAvailability.slots) {
                if (!slot.id || typeof slot.id !== 'string') return false;
                if (!slot.start || !isValidTime(slot.start)) return false;
                if (!slot.end || !isValidTime(slot.end)) return false;
            }
        }

        return true;
    } catch {
        return false;
    }
};

const isValidTime = (time: string): boolean => {
    return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
};

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

export const createBooking = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized - User not authenticated'
            });
            return;
        }

        const bookingData = req.body;

        // Validate request data
        const validation = validateBookingRequest(bookingData);
        if (!validation.isValid) {
            res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validation.errors
            });
            return;
        }

        const { date, slot, name, price, title, id: serviceId } = bookingData;

        const meetingStartTime = parseDateAndTime(date, slot.start);
        const meetingEndTime = parseDateAndTime(date, slot.end);
        const duration = calculateDuration(slot.start, slot.end);

        if (meetingStartTime <= new Date()) {
            res.status(400).json({
                success: false,
                error: 'Cannot schedule meetings in the past'
            });
            return;
        }

        const { data: serviceData, error: serviceError } = await supabase
            .from('services')
            .select('seller_id, service_title')
            .eq('id', serviceId)
            .single();

        if (serviceError || !serviceData) {
            res.status(404).json({
                success: false,
                error: 'Service not found'
            });
            return;
        }

        // Get buyer (current user) details
        const { data: buyerData, error: buyerError } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', userId)
            .single();

        if (buyerError) {
            console.warn('Could not fetch buyer details:', buyerError);
        }

        const buyerName = buyerData
            ? `${buyerData.first_name || ''} ${buyerData.last_name || ''}`.trim() || 'User'
            : 'User';

        // Check for existing booking conflicts
        const { data: existingBookings, error: conflictError } = await supabase
            .from('scheduled_meetings')
            .select('id')
            .eq('seller_id', serviceData.seller_id)
            .eq('meeting_date', meetingStartTime.toISOString().split('T')[0])
            .eq('meeting_start_time', slot.start + ':00')
            .eq('meeting_status', 'scheduled');

        if (conflictError) {
            throw new Error(`Error checking booking conflicts: ${conflictError.message}`);
        }

        if (existingBookings && existingBookings.length > 0) {
            res.status(409).json({
                success: false,
                error: 'This time slot is already booked'
            });
            return;
        }

        // Create Zoom meeting
        const zoomMeeting = await createZoomMeeting({
            topic: `${title} - 1:1 Consultation`,
            startTime: meetingStartTime,
            duration: duration,
            timezone: 'UTC'
        });

        // Store the meeting in database
        const meetingRecord = {
            service_id: serviceId,
            seller_id: serviceData.seller_id,
            buyer_id: userId,
            meeting_date: meetingStartTime.toISOString().split('T')[0],
            meeting_start_time: slot.start + ':00',
            meeting_end_time: slot.end + ':00',
            duration_minutes: duration,
            price: price,
            service_title: title,
            seller_name: name,
            buyer_name: buyerName,
            zoom_meeting_id: zoomMeeting.id,
            zoom_join_url: zoomMeeting.join_url,
            zoom_password: zoomMeeting.password,
            zoom_host_url: zoomMeeting.host_url,
            meeting_status: 'scheduled',
            payment_status: 'paid',
            zoom_meeting_created: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data: savedMeeting, error: saveError } = await supabase
            .from('scheduled_meetings')
            .insert(meetingRecord)
            .select('*')
            .single();

        if (saveError) {
            // If database save fails, try to delete the Zoom meeting
            try {
                const accessToken = await getZoomAccessToken();
                await fetch(`${ZOOM_CONFIG.apiBaseUrl}/meetings/${zoomMeeting.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                });
            } catch (cleanupError) {
                console.error('Failed to cleanup Zoom meeting after database error:', cleanupError);
            }

            throw new Error(`Failed to save meeting: ${saveError.message}`);
        }

        // Return success response
        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            data: {
                bookingId: savedMeeting.id,
                meetingDate: meetingStartTime.toISOString(),
                duration: duration,
                price: price,
                serviceTitle: title,
                sellerName: name,
                buyerName: buyerName,
                status: 'scheduled',
                // Don't return Zoom links in response for security
                zoomMeetingCreated: true
            }
        });

    } catch (error) {
        console.error('Error in createBooking:', error);

        // Handle specific Zoom API errors
        if (error instanceof Error && error.message.includes('Zoom')) {
            res.status(503).json({
                success: false,
                error: 'Failed to create meeting room',
                details: 'Meeting scheduling service is temporarily unavailable'
            });
            return;
        }

        // Handle database errors
        if (error instanceof Error && error.message.includes('Failed to save meeting')) {
            res.status(500).json({
                success: false,
                error: 'Database error',
                details: 'Could not save booking information'
            });
            return;
        }

        // Generic error handling
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
};