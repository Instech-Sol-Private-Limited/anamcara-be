import { Server, Socket } from 'socket.io';
import { supabase } from '../app';

export const connectedUsers = new Map<string, Set<string>>();

export const registerSocketHandlers = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log('🔌 Socket connected:', socket.id);

    socket.on('register', (email: string) => {
      if (!connectedUsers.has(email)) {
        connectedUsers.set(email, new Set());
      }
      connectedUsers.get(email)!.add(socket.id);
      console.log(`✅ Registered ${email}, total: ${connectedUsers.get(email)!.size}`);
    });

    socket.on('mark_as_read', async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) {
        console.error(`❌ mark_as_read error:`, error.message);
      } else {
        console.log(`📘 Notification ${id} marked as read`);
      }
    });

    socket.on('mark_all_as_read', async ({ userId }: { userId: string }) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        console.error(`❌ mark_all_as_read error:`, error.message);
      } else {
        console.log(`📘 All notifications marked as read for user: ${userId}`);
      }
    });

    socket.on('delete_notification', async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) {
        console.error(`❌ delete_notification error:`, error.message);
      } else {
        console.log(`🗑️ Notification ${id} deleted`);
      }
    });

    socket.on('disconnect', () => {
      for (const [email, socketSet] of connectedUsers.entries()) {
        if (socketSet.has(socket.id)) {
          socketSet.delete(socket.id);
          if (socketSet.size === 0) connectedUsers.delete(email);
          console.log(`❌ Disconnected ${socket.id} for ${email}`);
          break;
        }
      }
    });
  });
};
