import { Server, Socket } from 'socket.io';
import { supabase } from '../app';
import { getUserEmailFromId, getUserFriends } from './getUserFriends';

export const connectedUsers = new Map<string, Set<string>>();

export const registerSocketHandlers = (io: Server) => {
  console.log(connectedUsers);

  io.on('connection', (socket: Socket) => {
    console.log('🔌 Socket connected:', socket.id);

    // --------------------- Register User ------------------
    socket.on('register', async ({ email, userid }: { email: string, userid: string }) => {
      if (!connectedUsers.has(email)) {
        connectedUsers.set(email, new Set());
      }
      connectedUsers.get(email)!.add(socket.id);

      console.log(`✅ Registered ${email}`);
      console.log(`🌐 Connected Users: ${connectedUsers.size}`);
      for (const [userEmail, sockets] of connectedUsers.entries()) {
        console.log(`- ${userEmail}: ${[...sockets].join(', ')}`);
      }

      // Notify friends
      const friends = await getUserFriends(email);
      console.log('friends:', friends);

      for (const friend of friends) {
        const friendSockets = connectedUsers.get(friend);
        if (friendSockets) {
          friendSockets.forEach((socketId) =>
            io.to(socketId).emit('friend_online', email)
          );
        }
      }

      // Find chat IDs where the user is a participant
      const { data: chatList, error: chatError } = await supabase
        .from('chats')
        .select('id')
        .or(`user_1.eq.${userid},user_2.eq.${userid}`);

      if (chatError) {
        console.error('❌ Error fetching chat list:', chatError.message);
        return;
      }

      const chatIds = chatList?.map(chat => chat.id) || [];

      // Fetch all "sent" messages in those chats where current user is the receiver
      const { data: messages, error: messagesError } = await supabase
        .from('chatmessages')
        .select('id, chat_id, sender')
        .in('chat_id', chatIds)
        .eq('status', 'sent')
        .neq('sender', userid);

      if (messagesError) {
        console.error('❌ Error fetching undelivered messages:', messagesError.message);
      } else if (messages.length > 0) {
        const messageIds = messages.map(msg => msg.id);

        const { error: updateError } = await supabase
          .from('chatmessages')
          .update({ status: 'delivered' })
          .in('id', messageIds);

        if (updateError) {
          console.error('❌ Error updating message statuses:', updateError.message);
        } else {
          for (const message of messages) {
            const senderEmail = await getUserEmailFromId(message.sender);
            if (senderEmail) {
              const senderSockets = connectedUsers.get(senderEmail);
              if (senderSockets) {
                senderSockets.forEach(socketId => {
                  io.to(socketId).emit('message_status_update', {
                    messageId: message.id,
                    status: 'delivered'
                  });
                });
              }
            }
          }
        }
      }

      // Notify current user about which friends are online
      const onlineFriends = friends.filter(friend =>
        connectedUsers.has(friend) && connectedUsers.get(friend)!.size > 0
      );

      if (onlineFriends.length > 0) {
        console.log(`🟢 Notifying ${email} about online friends:`, onlineFriends);
        onlineFriends.forEach(friendEmail => {
          socket.emit('friend_online', friendEmail);
        });
      }
    });

    // --------------------- 1-1 Chat Events ------------------

    // Send a message
    socket.on('send_message', async (payload: {
      chat_id: string,
      sender: string,
      receiver_email: string,
      message: string | null,
      has_media: boolean,
      media?: string[],
      message_type?: string,
      reply_to?: string | null
    }) => {
      const { chat_id, sender, receiver_email, message, has_media, media, message_type, reply_to } = payload;

      if (has_media && (!media || media.length === 0)) {
        socket.emit('message_error', { error: 'Media array required when has_media is true' });
        return;
      }

      if (!message && !has_media) {
        socket.emit('message_error', { error: 'Message content or media required' });
        return;
      }

      try {
        const messageData = {
          chat_id,
          sender,
          message: message || null,
          has_media,
          media: has_media ? media : null,
          message_type: has_media ? (message_type || 'image') : null,
          reply_to: reply_to || null,
          status: 'sent',
          created_at: new Date().toISOString(),
          is_deleted: false,
          is_edited: false
        };

        const { data: insertedMessage, error: insertError } = await supabase
          .from('chatmessages')
          .insert([messageData])
          .select()
          .single();

        if (insertError || !insertedMessage) {
          throw new Error(insertError?.message || 'Failed to insert message');
        }

        await supabase
          .from('chats')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', chat_id);

        const receiverSockets = connectedUsers.get(receiver_email);
        if (receiverSockets) {
          receiverSockets.forEach(socketId => {
            io.to(socketId).emit('receive_message', insertedMessage);
          });
        }

        socket.emit('message_sent', insertedMessage);

      } catch (error) {
        console.error('Message send error:', error);
        socket.emit('message_error', {
          error: error instanceof Error ? error.message : 'Failed to send message'
        });
      }
    });

    // Message delivered
    socket.on('message_delivered', async ({ messageId, userId }: { messageId: number, userId: string }) => {
      const { error } = await supabase
        .from('chatmessages')
        .update({ status: 'delivered' })
        .eq('id', messageId);

      if (error) {
        console.error('Delivery update error:', error.message);
        return;
      }

      const { data: message } = await supabase
        .from('chatmessages')
        .select('sender')
        .eq('id', messageId)
        .single();

      if (message) {
        const senderEmail = await getUserEmailFromId(message.sender);
        if (senderEmail && connectedUsers.has(senderEmail)) {
          connectedUsers.get(senderEmail)!.forEach(socketId => {
            io.to(socketId).emit('message_status_update', {
              messageId,
              status: 'delivered'
            });
          });
        }
      }
    });

    // Message seen
    socket.on('message_seen', async ({ messageId, userId }: { messageId: number, userId: string }) => {
      const { error } = await supabase
        .from('chatmessages')
        .update({ status: 'seen' })
        .eq('id', messageId);

      if (error) {
        console.error('Seen update error:', error.message);
        return;
      }

      const { data: message } = await supabase
        .from('chatmessages')
        .select('sender, chat_id')
        .eq('id', messageId)
        .single();

      if (message) {
        const senderEmail = await getUserEmailFromId(message.sender);
        if (senderEmail && connectedUsers.has(senderEmail)) {
          connectedUsers.get(senderEmail)!.forEach(socketId => {
            io.to(socketId).emit('message_status_update', {
              messageId,
              status: 'seen'
            });
          });
        }
      }
    });

    // Delete message
    socket.on('delete_message', async ({ messageId, userId }: { messageId: number, userId: string }) => {
      const { data: message } = await supabase
        .from('chatmessages')
        .select('sender, chat_id')
        .eq('id', messageId)
        .single();

      if (!message || (message.sender !== userId)) {
        socket.emit('delete_message_error', {
          messageId,
          error: 'Not authorized to delete this message'
        });
        return;
      }

      const { error } = await supabase
        .from('chatmessages')
        .update({
          is_deleted: true,
          deleted_by: userId,
          deleted_at: new Date().toISOString()
        })
        .eq('id', messageId);

      if (error) {
        console.error('Delete error:', error.message);
        socket.emit('delete_message_error', { messageId, error: error.message });
        return;
      }

      const { data: chat } = await supabase
        .from('chats')
        .select('user_1, user_2')
        .eq('id', message.chat_id)
        .single();

      if (chat) {
        const [user1Email, user2Email] = await Promise.all([
          getUserEmailFromId(chat.user_1),
          getUserEmailFromId(chat.user_2)
        ]);

        const payload = { messageId, deletedBy: userId };
        [user1Email, user2Email].forEach(email => {
          if (email && connectedUsers.has(email)) {
            connectedUsers.get(email)!.forEach(socketId => {
              io.to(socketId).emit('message_deleted', payload);
            });
          }
        });
      }
    });

    // Edit message
    socket.on('edit_message', async ({
      messageId,
      sender,
      newMessage
    }: {
      messageId: number,
      sender: string,
      newMessage: string
    }) => {

      const { data: message } = await supabase
        .from('chatmessages')
        .select('sender, chat_id, message')
        .eq('id', messageId)
        .single();

      if (!message || message.sender !== sender) {
        socket.emit('edit_message_error', {
          messageId,
          error: 'Not authorized to edit this message'
        });
        return;
      }

      const { data: editedData, error } = await supabase
        .from('chatmessages')
        .update({
          message: newMessage,
          is_edited: true,
          edited_by: sender,
          edited_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .select('edited_at')
        .single();

      if (error) {
        socket.emit('edit_message_error', { messageId, error: error.message });
        return;
      }

      const { data: chat } = await supabase
        .from('chats')
        .select('id, user_1, user_2')
        .eq('id', message.chat_id)
        .single();

      if (chat) {
        const [user1Email, user2Email] = await Promise.all([
          getUserEmailFromId(chat.user_1),
          getUserEmailFromId(chat.user_2)
        ]);

        const payload = {
          messageId,
          newMessage,
          editedBy: sender,
          editedAt: editedData?.edited_at,
          previousContent: message.message,
          chatId: chat.id,
          sender: sender,
        };

        [user1Email, user2Email].forEach(email => {
          if (email && connectedUsers.has(email)) {
            connectedUsers.get(email)!.forEach(socketId => {
              io.to(socketId).emit('message_edited', payload);
            });
          }
        });
      }
    });

    // Typing indicators
    socket.on('typing', ({ chatId, userId, receiver_email }: { chatId: number, userId: string, receiver_email: string }) => {
      if (receiver_email && connectedUsers.has(receiver_email)) {
        connectedUsers.get(receiver_email)!.forEach(socketId => {
          io.to(socketId).emit('user_typing', { chatId, userId });
        });
      }
    });

    // stop typing
    socket.on('stop_typing', ({ chatId, userId, receiver_email }: { chatId: number, userId: string, receiver_email: string }) => {
      if (receiver_email && connectedUsers.has(receiver_email)) {
        connectedUsers.get(receiver_email)!.forEach(socketId => {
          io.to(socketId).emit('user_stop_typing', { chatId, userId });
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
    socket.on('disconnect', async () => {
      for (const [email, socketSet] of connectedUsers.entries()) {
        if (socketSet.has(socket.id)) {
          socketSet.delete(socket.id);

          if (socketSet.size === 0) {
            connectedUsers.delete(email);

            // Notify only friends of this user about going offline
            const friends = await getUserFriends(email);
            for (const friend of friends) {
              const friendSockets = connectedUsers.get(friend);
              if (friendSockets) {
                friendSockets.forEach((socketId) =>
                  io.to(socketId).emit('friend_offline', email)
                );
              }
            }
          }

          console.log(`❌ Disconnected ${socket.id} from ${email}`);
          break;
        }
      }
    });
  });
};
