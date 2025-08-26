declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export interface User {
  id: string;
  email: string;
  role: string;
  name?: string;
  avatar_url?: string;
  [key: string]: any;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

// types/index.ts
export interface MarketplaceStats {
  id?: string;
  date: string;
  total_bookings: number;
  active_bookings: number;
  completed_bookings: number;
  total_services: number;
  active_services: number;
  total_users: number;
  active_users: number;
  total_revenue: number;
  daily_revenue: number;
  created_at?: string;
  updated_at?: string;
}

export interface SlotBooking {
  id: string;
  service_id: string;
  seller_id: string;
  buyer_id: string;
  meeting_date: string;
  meeting_start_time: string;
  meeting_end_time: string;
  duration_minutes: number;
  price: number;
  service_title: string;
  seller_name: string;
  buyer_name: string;
  booking_status: string;
  zoom_meeting_id: string;
  zoom_join_url: string;
  zoom_password: string;
  zoom_host_url: string;
  meeting_status: string;
  payment_status: string;
  created_at: string;
  updated_at: string;
  meeting_reminder_sent: boolean;
  zoom_meeting_created: boolean;
  buyer_review_taken: boolean;
  seller_review_taken: boolean;
}

export interface MeetingTrack {
  id: string;
  booking_id: string;
  zoom_meeting_id: number;
  event_type: string;
  event_time: string;
  participant_count: number;
  participant_details: any;
  meeting_start_time: string;
  meeting_end_time: string;
  duration: number;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  seller_id: string;
  service_title: string;
  service_category: string;
  description: string;
  keywords: string[];
  thumbnails: any;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  bookingcall_array: number[];
}