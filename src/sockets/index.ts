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

      const { data: chatList, error: chatError } = await supabase
        .from('chats')
        .select('id')
        .or(`user_1.eq.${userid},user_2.eq.${userid}`);

      if (chatError) {
        console.error('❌ Error fetching chat list:', chatError.message);
        return;
      }

      const chatIds = chatList?.map(chat => chat.id) || [];

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

    // --------------------- Public Chat Events ------------------

    // Send a public message
    socket.on('public_send_message', async (payload: {
      sender_id: string;
      message: string;
    }) => {
      const { sender_id, message } = payload;

      try {
        const messageData = {
          sender_id,
          message,
          is_edited: false,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null
        };

        const { data: insertedMessage, error: insertError } = await supabase
          .from('public_chat')
          .insert([messageData])
          .select()
          .single();

        if (insertError || !insertedMessage) {
          throw new Error(insertError?.message || 'Failed to insert public message');
        }
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .eq('id', sender_id)
          .single();

        const completeMessage = {
          ...insertedMessage,
          sender: senderProfile
        };

        // Broadcast to all connected users
        io.emit('public_receive_message', completeMessage);
        socket.emit('public_message_sent', completeMessage);

      } catch (error) {
        console.error('Public message send error:', error);
        socket.emit('public_message_error', {
          error: error instanceof Error ? error.message : 'Failed to send public message'
        });
      }
    });

    // Edit public message
    socket.on('public_edit_message', async ({
      messageId,
      sender_id,
      newMessage
    }: {
      messageId: string;
      sender_id: string;
      newMessage: string;
    }) => {
      const { data: message } = await supabase
        .from('public_chat')
        .select('sender_id')
        .eq('id', messageId)
        .single();

      if (!message || message.sender_id !== sender_id) {
        socket.emit('public_edit_message_error', {
          messageId,
          error: 'Not authorized to edit this message'
        });
        return;
      }

      const { data: editedData, error } = await supabase
        .from('public_chat')
        .update({
          message: newMessage,
          is_edited: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .select()
        .single();

      if (error) {
        socket.emit('public_edit_message_error', { messageId, error: error.message });
        return;
      }

      // Broadcast to all connected users
      io.emit('public_message_edited', {
        id: messageId,
        message: newMessage,
        updated_at: editedData?.updated_at
      });
    });

    // Delete public message
    socket.on('public_delete_message', async ({
      messageId,
      sender_id
    }: {
      messageId: string;
      sender_id: string
    }) => {
      const { data: message } = await supabase
        .from('public_chat')
        .select('sender_id')
        .eq('id', messageId)
        .single();

      if (!message || message.sender_id !== sender_id) {
        socket.emit('public_delete_message_error', {
          messageId,
          error: 'Not authorized to delete this message'
        });
        return;
      }

      const { error } = await supabase
        .from('public_chat')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', messageId);

      if (error) {
        socket.emit('public_delete_message_error', {
          messageId,
          error: error.message
        });
        return;
      }

      // Broadcast to all connected users
      io.emit('public_message_deleted', {
        id: messageId,
        deleted_at: new Date().toISOString()
      });
    });

    // Public chat typing indicators
    socket.on('public_typing', ({ sender_id }: { sender_id: string }) => {
      socket.broadcast.emit('public_user_typing', sender_id);
    });

    socket.on('public_stop_typing', ({ sender_id }: { sender_id: string }) => {
      socket.broadcast.emit('public_user_stop_typing', sender_id);
    });

    // Public user online status
    socket.on('public_user_online', (userId: string) => {
      socket.broadcast.emit('public_user_online', userId);
    });

    socket.on('public_user_offline', (userId: string) => {
      socket.broadcast.emit('public_user_offline', userId);
    });


    // --------------------- Public Chat Events ------------------

    // Send a public message
    socket.on('travel_send_message', async (payload: {
      sender_id: string;
      message: string;
    }) => {
      const { sender_id, message } = payload;

      try {
        const messageData = {
          sender_id,
          message,
          is_edited: false,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null
        };

        const { data: insertedMessage, error: insertError } = await supabase
          .from('travel_chat')
          .insert([messageData])
          .select()
          .single();

        if (insertError || !insertedMessage) {
          throw new Error(insertError?.message || 'Failed to insert public message');
        }

        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .eq('id', sender_id)
          .single();

        const completeMessage = {
          ...insertedMessage,
          sender: senderProfile
        };

        io.emit('travel_receive_message', completeMessage);
        socket.emit('travel_message_sent', completeMessage);

      } catch (error) {
        console.error('Public message send error:', error);
        socket.emit('travel_message_error', {
          error: error instanceof Error ? error.message : 'Failed to send public message'
        });
      }
    });

    // Edit public message
    socket.on('travel_edit_message', async ({
      messageId,
      sender_id,
      newMessage
    }: {
      messageId: string;
      sender_id: string;
      newMessage: string;
    }) => {
      const { data: message } = await supabase
        .from('travel_chat')
        .select('sender_id')
        .eq('id', messageId)
        .single();

      if (!message || message.sender_id !== sender_id) {
        socket.emit('travel_edit_message_error', {
          messageId,
          error: 'Not authorized to edit this message'
        });
        return;
      }

      const { data: editedData, error } = await supabase
        .from('travel_chat')
        .update({
          message: newMessage,
          is_edited: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .select()
        .single();

      if (error) {
        socket.emit('travel_edit_message_error', { messageId, error: error.message });
        return;
      }

      // Broadcast to all connected users
      io.emit('travel_message_edited', {
        id: messageId,
        message: newMessage,
        updated_at: editedData?.updated_at
      });
    });

    // Delete public message
    socket.on('travel_delete_message', async ({
      messageId,
      sender_id
    }: {
      messageId: string;
      sender_id: string
    }) => {
      const { data: message } = await supabase
        .from('travel_chat')
        .select('sender_id')
        .eq('id', messageId)
        .single();

      if (!message || message.sender_id !== sender_id) {
        socket.emit('travel_delete_message_error', {
          messageId,
          error: 'Not authorized to delete this message'
        });
        return;
      }

      const { error } = await supabase
        .from('travel_chat')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', messageId);

      if (error) {
        socket.emit('travel_delete_message_error', {
          messageId,
          error: error.message
        });
        return;
      }

      // Broadcast to all connected users
      io.emit('travel_message_deleted', {
        id: messageId,
        deleted_at: new Date().toISOString()
      });
    });

    // Public chat typing indicators
    socket.on('travel_typing', ({ sender_id }: { sender_id: string }) => {
      socket.broadcast.emit('travel_user_typing', sender_id);
    });

    socket.on('travel_stop_typing', ({ sender_id }: { sender_id: string }) => {
      socket.broadcast.emit('travel_user_stop_typing', sender_id);
    });

    // Public user online status
    socket.on('travel_user_online', (userId: string) => {
      socket.broadcast.emit('travel_user_online', userId);
    });

    socket.on('travel_user_offline', (userId: string) => {
      socket.broadcast.emit('travel_user_offline', userId);
    });


    // --------------------- Chambers Events ------------------

    // Join a chamber (group)
    socket.on('chamber_join', async (payload: {
      chamber_id: string;
      user_id: string;
    }) => {
      const { chamber_id, user_id } = payload;

      try {
        // Check if chamber exists and is active
        const { data: chamber, error: chamberError } = await supabase
          .from('custom_chambers')
          .select('id, is_public, is_active, member_count')
          .eq('id', chamber_id)
          .single();

        if (chamberError || !chamber) {
          throw new Error(chamberError?.message || 'Chamber not found');
        }

        if (!chamber.is_active) {
          throw new Error('This chamber is currently inactive');
        }

        if (!chamber.is_public) {
          // For private chambers, check if user is a member
          const { data: membership, error: membershipError } = await supabase
            .from('chamber_members')
            .select('user_id')
            .eq('chamber_id', chamber_id)
            .eq('user_id', user_id)
            .single();

          if (membershipError || !membership) {
            throw new Error('Not authorized to join this private chamber');
          }
        }

        // Join the room
        socket.join(`chamber_${chamber_id}`);

        // Get user profile
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .eq('id', user_id)
          .single();

        // Notify others in the chamber
        socket.to(`chamber_${chamber_id}`).emit('chamber_user_joined', {
          chamber_id,
          user: userProfile,
          timestamp: new Date().toISOString()
        });

        // Send success response with chamber details
        socket.emit('chamber_joined', {
          chamber_id,
          member_count: chamber.member_count || 0
        });

      } catch (error) {
        console.error('Chamber join error:', error);
        socket.emit('chamber_join_error', {
          chamber_id,
          error: error instanceof Error ? error.message : 'Failed to join chamber'
        });
      }
    });

    // Leave a chamber
    socket.on('chamber_leave', async (payload: {
      chamber_id: string;
      user_id: string;
    }) => {
      const { chamber_id, user_id } = payload;

      // Get user profile before leaving
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .eq('id', user_id)
        .single();

      socket.leave(`chamber_${chamber_id}`);

      // Notify others in the chamber
      socket.to(`chamber_${chamber_id}`).emit('chamber_user_left', {
        chamber_id,
        user: userProfile,
        timestamp: new Date().toISOString()
      });
    });

    // Send a message to a chamber (with reply support)
    socket.on('chamber_send_message', async (payload: {
      chamber_id: string;
      sender_id: string;
      message: string;
      reply_to?: string;
    }) => {
      const { chamber_id, sender_id, message, reply_to } = payload;

      try {
        const { data: membership, error: membershipError } = await supabase
          .from('chamber_members')
          .select('user_id, is_moderator')
          .eq('chamber_id', chamber_id)
          .eq('user_id', sender_id)
          .single();

        if (membershipError || !membership) {
          throw new Error('Not authorized to send messages to this chamber');
        }

        // If replying, verify the parent message exists in this chamber
        if (reply_to) {
          const { data: parentMessage, error: parentError } = await supabase
            .from('chamber_messages')
            .select('id')
            .eq('id', reply_to)
            .eq('chamber_id', chamber_id)
            .single();

          if (parentError || !parentMessage) {
            throw new Error('The message you are replying to does not exist in this chamber');
          }
        }

        const messageData: any = {
          chamber_id,
          sender_id,
          message,
          is_edited: false,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        if (reply_to) {
          messageData.reply_to = reply_to;
        }

        const { data: insertedMessage, error: insertError } = await supabase
          .from('chamber_messages')
          .insert([messageData])
          .select()
          .single();

        if (insertError || !insertedMessage) {
          throw new Error(insertError?.message || 'Failed to insert chamber message');
        }

        // Get sender profile and possibly replied message
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .eq('id', sender_id)
          .single();

        const completeMessage: any = {
          ...insertedMessage,
          sender: senderProfile
        };

        // If this is a reply, get the parent message details
        if (reply_to) {
          const { data: parentMessage } = await supabase
            .from('chamber_messages')
            .select('id, sender_id, message')
            .eq('id', reply_to)
            .single();

          if (parentMessage) {
            const { data: parentSender } = await supabase
              .from('profiles')
              .select('id, first_name, last_name')
              .eq('id', parentMessage.sender_id)
              .single();

            completeMessage.replied_message = {
              id: parentMessage.id,
              message: parentMessage.message,
              sender: parentSender
            };
          }
        }

        // Send to everyone in the chamber
        io.to(`chamber_${chamber_id}`).emit('chamber_receive_message', completeMessage);
        socket.emit('chamber_message_sent', completeMessage);

        // Update last activity timestamp for the chamber
        await supabase
          .from('custom_chambers')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', chamber_id);

      } catch (error) {
        console.error('Chamber message send error:', error);
        socket.emit('chamber_message_error', {
          chamber_id,
          error: error instanceof Error ? error.message : 'Failed to send chamber message'
        });
      }
    });

    // Edit chamber message
    socket.on('chamber_edit_message', async ({
      chamber_id,
      messageId,
      sender_id,
      newMessage
    }: {
      chamber_id: string;
      messageId: string;
      sender_id: string;
      newMessage: string;
    }) => {
      try {
        // Get message and verify permissions
        const { data: message } = await supabase
          .from('chamber_messages')
          .select('sender_id, chamber_id')
          .eq('id', messageId)
          .single();

        if (!message || message.chamber_id !== chamber_id) {
          throw new Error('Message not found in this chamber');
        }

        // Check if user is sender or moderator
        const { data: membership } = await supabase
          .from('chamber_members')
          .select('is_moderator')
          .eq('chamber_id', chamber_id)
          .eq('user_id', sender_id)
          .single();

        if (message.sender_id !== sender_id && (!membership || !membership.is_moderator)) {
          throw new Error('Not authorized to edit this message');
        }

        const { data: editedData, error } = await supabase
          .from('chamber_messages')
          .update({
            message: newMessage,
            is_edited: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', messageId)
          .select()
          .single();

        if (error) throw error;

        // Broadcast to everyone in the chamber
        io.to(`chamber_${chamber_id}`).emit('chamber_message_edited', {
          id: messageId,
          message: newMessage,
          updated_at: editedData?.updated_at,
          chamber_id,
          edited_by: sender_id
        });

        // Update chamber's last activity timestamp
        await supabase
          .from('custom_chambers')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', chamber_id);

      } catch (error) {
        console.error('Chamber message edit error:', error);
        socket.emit('chamber_edit_message_error', {
          chamber_id,
          messageId,
          error: error instanceof Error ? error.message : 'Failed to edit message'
        });
      }
    });

    // Delete chamber message
    socket.on('chamber_delete_message', async ({
      chamber_id,
      messageId,
      sender_id
    }: {
      chamber_id: string;
      messageId: string;
      sender_id: string;
    }) => {
      try {
        // Get message and verify permissions
        const { data: message } = await supabase
          .from('chamber_messages')
          .select('sender_id, chamber_id')
          .eq('id', messageId)
          .single();

        if (!message || message.chamber_id !== chamber_id) {
          throw new Error('Message not found in this chamber');
        }

        // Check if user is sender or moderator
        const { data: membership } = await supabase
          .from('chamber_members')
          .select('is_moderator')
          .eq('chamber_id', chamber_id)
          .eq('user_id', sender_id)
          .single();

        if (message.sender_id !== sender_id && (!membership || !membership.is_moderator)) {
          throw new Error('Not authorized to delete this message');
        }

        const { error } = await supabase
          .from('chamber_messages')
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString()
          })
          .eq('id', messageId);

        if (error) throw error;

        // Broadcast to everyone in the chamber
        io.to(`chamber_${chamber_id}`).emit('chamber_message_deleted', {
          id: messageId,
          deleted_at: new Date().toISOString(),
          chamber_id,
          deleted_by: sender_id
        });

        // Update chamber's last activity timestamp
        await supabase
          .from('custom_chambers')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', chamber_id);

      } catch (error) {
        console.error('Chamber message delete error:', error);
        socket.emit('chamber_delete_message_error', {
          chamber_id,
          messageId,
          error: error instanceof Error ? error.message : 'Failed to delete message'
        });
      }
    });

    // Chamber typing indicators
    socket.on('chamber_typing', async ({
      chamber_id,
      sender_id
    }: {
      chamber_id: string;
      sender_id: string;
    }) => {
      // Verify user is in the chamber
      const { data: membership } = await supabase
        .from('chamber_members')
        .select('user_id')
        .eq('chamber_id', chamber_id)
        .eq('user_id', sender_id)
        .single();

      if (membership) {
        socket.to(`chamber_${chamber_id}`).emit('chamber_user_typing', {
          chamber_id,
          sender_id,
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('chamber_stop_typing', async ({
      chamber_id,
      sender_id
    }: {
      chamber_id: string;
      sender_id: string;
    }) => {
      // Verify user is in the chamber
      const { data: membership } = await supabase
        .from('chamber_members')
        .select('user_id')
        .eq('chamber_id', chamber_id)
        .eq('user_id', sender_id)
        .single();

      if (membership) {
        socket.to(`chamber_${chamber_id}`).emit('chamber_user_stop_typing', {
          chamber_id,
          sender_id,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get chamber history
    socket.on('chamber_get_history', async ({
      chamber_id,
      user_id,
      limit = 50,
      offset = 0
    }: {
      chamber_id: string;
      user_id: string;
      limit?: number;
      offset?: number;
    }) => {
      try {
        // Verify user has access to the chamber
        const { data: chamber } = await supabase
          .from('custom_chambers')
          .select('is_public')
          .eq('id', chamber_id)
          .single();

        if (!chamber) throw new Error('Chamber not found');

        if (!chamber.is_public) {
          const { data: membership } = await supabase
            .from('chamber_members')
            .select('user_id')
            .eq('chamber_id', chamber_id)
            .eq('user_id', user_id)
            .single();

          if (!membership) throw new Error('Not authorized to view this chamber');
        }

        // Get messages with sender profiles
        const { data: messages, error } = await supabase
          .from('chamber_messages')
          .select(`
        id,
        chamber_id,
        sender_id,
        message,
        is_edited,
        is_deleted,
        created_at,
        updated_at,
        reply_to,
        profiles: sender_id (id, first_name, last_name, avatar_url)
      `)
          .eq('chamber_id', chamber_id)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        // For messages that are replies, get the parent message details
        const messagesWithReplies = await Promise.all(
          messages.map(async (msg: any) => {
            if (!msg.reply_to) return msg;

            const { data: parentMessage } = await supabase
              .from('chamber_messages')
              .select(`
            id,
            message,
            sender_id,
            profiles: sender_id (id, first_name, last_name)
          `)
              .eq('id', msg.reply_to)
              .single();

            return {
              ...msg,
              replied_message: parentMessage ? {
                id: parentMessage.id,
                message: parentMessage.message,
                sender: parentMessage.profiles
              } : null
            };
          })
        );

        socket.emit('chamber_history', {
          chamber_id,
          messages: messagesWithReplies.reverse(), // Return in chronological order
          limit,
          offset
        });

      } catch (error) {
        console.error('Chamber history error:', error);
        socket.emit('chamber_history_error', {
          chamber_id,
          error: error instanceof Error ? error.message : 'Failed to load chamber history'
        });
      }
    });

    // Chamber member events
    socket.on('chamber_add_member', async ({
      chamber_id,
      user_id,
      adder_id
    }: {
      chamber_id: string;
      user_id: string;
      adder_id: string;
    }) => {
      try {
        // Verify adder has permissions (moderator or creator)
        const { data: chamber } = await supabase
          .from('custom_chambers')
          .select('creator_id')
          .eq('id', chamber_id)
          .single();

        const { data: adderMembership } = await supabase
          .from('chamber_members')
          .select('is_moderator')
          .eq('chamber_id', chamber_id)
          .eq('user_id', adder_id)
          .single();

        if (chamber?.creator_id !== adder_id && (!adderMembership || !adderMembership.is_moderator)) {
          throw new Error('Not authorized to add members');
        }

        // Add the member
        const { error } = await supabase
          .from('chamber_members')
          .insert([{
            chamber_id,
            user_id,
            joined_at: new Date().toISOString(),
            is_moderator: false
          }]);

        if (error) throw error;

        // Update member count
        await supabase.rpc('increment_member_count', { chamber_id: chamber_id });

        // Get user profile
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .eq('id', user_id)
          .single();

        // Notify chamber and the new member
        io.to(`chamber_${chamber_id}`).emit('chamber_member_added', {
          chamber_id,
          user: userProfile,
          added_by: adder_id,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('Add member error:', error);
        socket.emit('chamber_member_error', {
          chamber_id,
          error: error instanceof Error ? error.message : 'Failed to add member'
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
