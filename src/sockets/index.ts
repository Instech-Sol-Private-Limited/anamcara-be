import { Server, Socket } from 'socket.io';
import { supabase } from '../app';

export const connectedUsers = new Map<string, Set<string>>();

export const registerSocketHandlers = (io: Server) => {
  console.log(connectedUsers);

  io.on('connection', (socket: Socket) => {
    console.log('🔌 Socket connected:', socket.id);

    // --------------------- Register User ------------------
    socket.on('register', (email: string) => {
      if (!connectedUsers.has(email)) {
        connectedUsers.set(email, new Set());
        io.emit('user_online', email);
        io.emit('chat_user_online', email);
      }
      connectedUsers.get(email)!.add(socket.id);
      console.log(`✅ Registered ${email}, total sockets: ${connectedUsers.get(email)!.size}`);
    });

    // --------------------- Chat Events ------------------

    // Send a message
    socket.on('send_message', async (payload: {
      sender: string;
      receiver: string;
      content: string;
    }) => {
      const { sender, receiver, content } = payload;

      const { data, error } = await supabase
        .from('chatmessages')
        .insert([{ sender, receiver, content, status: 'sent' }])
        .select()
        .single();

      if (error) {
        console.error('❌ Error sending message:', error.message);
      } else {
        // Emit to receiver if online
        const receiverSockets = connectedUsers.get(receiver);
        if (receiverSockets) {
          receiverSockets.forEach((socketId) =>
            io.to(socketId).emit('receive_message', data)
          );
        }

        // Emit back to sender for confirmation
        socket.emit('message_sent', data);
        console.log(`📨 Message from ${sender} to ${receiver}`);
      }
    });

    // Mark as delivered
    socket.on('message_delivered', async ({ messageId }: { messageId: string }) => {
      const { error } = await supabase
        .from('chatmessages')
        .update({ status: 'delivered' })
        .eq('id', messageId);

      if (!error) {
        io.emit('message_status_update', { messageId, status: 'delivered' });
      }
    });

    // Mark as seen
    socket.on('message_seen', async ({ messageId }: { messageId: string }) => {
      const { error } = await supabase
        .from('chatmessages')
        .update({ status: 'seen' })
        .eq('id', messageId);

      if (!error) {
        io.emit('message_status_update', { messageId, status: 'seen' });
      }
    });

    // Delete a message
    socket.on('delete_message', async ({ messageId }: { messageId: string }) => {
      const { error } = await supabase
        .from('chatmessages')
        .delete()
        .eq('id', messageId);

      if (!error) {
        io.emit('message_deleted', messageId);
        console.log(`🗑️ Deleted message: ${messageId}`);
      }
    });

    // Typing indicator
    socket.on('typing', ({ from, to }: { from: string; to: string }) => {
      const receiverSockets = connectedUsers.get(to);
      if (receiverSockets) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit('user_typing', { from });
        });
      }
    });

    socket.on('stop_typing', ({ from, to }: { from: string; to: string }) => {
      const receiverSockets = connectedUsers.get(to);
      if (receiverSockets) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit('user_stop_typing', { from });
        });
      }
    });

    // --------------------- Notification Events ------------------

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

    // --------------------- Disconnect ------------------
    socket.on('disconnect', () => {
      for (const [email, socketSet] of connectedUsers.entries()) {
        if (socketSet.has(socket.id)) {
          socketSet.delete(socket.id);
          if (socketSet.size === 0) {
            connectedUsers.delete(email);
            io.emit('user_offline', email);
            io.emit('chat_user_offline', email);
          }
          console.log(`❌ Disconnected ${socket.id} from ${email}`);
          break;
        }
      }
    });
  });
};
