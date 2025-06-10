import { io, supabase } from '../app';
import { connectedUsers } from '.';

interface NotificationInput {
  recipientEmail: string;
  recipientUserId: string;
  actorUserId: string | null;
  threadId: string;
  message: string;
  type: 'reaction' | 'comment' | 'mention' | string;
  metadata?: Record<string, any>;
}

interface NotificationRecord {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  action_performed_by: string | null;
  thread_id: string;
  is_read: boolean;
  type: string;
  metadata: Record<string, any>;
}

export async function sendNotification({
  recipientEmail,
  recipientUserId,
  actorUserId,
  threadId,
  message,
  type,
  metadata = {},
}: NotificationInput): Promise<void> {

  const { data, error } = await supabase
    .from('notifications')
    .insert([
      {
        user_id: recipientUserId,
        action_performed_by: actorUserId,
        thread_id: threadId,
        message,
        type,
        metadata,
      },
    ])
    .select()
    .single<NotificationRecord>();

  if (error) {
    console.error('❌ Error storing notification:', error.message);
    return;
  }

  const socketIds = connectedUsers.get(recipientEmail);
  if (socketIds && socketIds.size > 0) {
    socketIds.forEach((socketId) => {
      io.to(socketId).emit('notification', data);
    });
    console.log(`📨 Sent notification to all devices of ${recipientEmail}`);
  } else {
    console.log(`📭 ${recipientEmail} is offline, notification stored for later delivery`);
  }
}
