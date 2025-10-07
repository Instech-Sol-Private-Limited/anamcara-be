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
exports.registerSocketHandlers = exports.connectedUsers = void 0;
const app_1 = require("../app");
const getUserFriends_1 = require("./getUserFriends");
const manageChambers_1 = require("./manageChambers");
const chess_handler_1 = require("./chess.handler");
const chess_ai_handler_1 = require("./chess-ai.handler");
exports.connectedUsers = new Map();
const registerSocketHandlers = (io) => {
    console.log(exports.connectedUsers);
    io.on('connection', (socket) => {
        console.log('🔌 Socket connected:', socket.id);
        // --------------------- Register User ------------------
        socket.on('register', (_a) => __awaiter(void 0, [_a], void 0, function* ({ email, userid }) {
            if (!exports.connectedUsers.has(email)) {
                exports.connectedUsers.set(email, new Set());
            }
            exports.connectedUsers.get(email).add(socket.id);
            console.log(`✅ Registered ${email}`);
            console.log(`🌐 Connected Users: ${exports.connectedUsers.size}`);
            for (const [userEmail, sockets] of exports.connectedUsers.entries()) {
                console.log(`- ${userEmail}: ${[...sockets].join(', ')}`);
            }
            const friends = yield (0, getUserFriends_1.getUserFriends)(email);
            console.log('friends:', friends);
            for (const friend of friends) {
                const friendSockets = exports.connectedUsers.get(friend);
                if (friendSockets) {
                    friendSockets.forEach((socketId) => io.to(socketId).emit('friend_online', email));
                }
            }
            const { data: chatList, error: chatError } = yield app_1.supabase
                .from('chats')
                .select('id')
                .or(`user_1.eq.${userid},user_2.eq.${userid}`);
            if (chatError) {
                console.error('❌ Error fetching chat list:', chatError.message);
                return;
            }
            const chatIds = (chatList === null || chatList === void 0 ? void 0 : chatList.map(chat => chat.id)) || [];
            const { data: messages, error: messagesError } = yield app_1.supabase
                .from('chatmessages')
                .select('id, chat_id, sender')
                .in('chat_id', chatIds)
                .eq('status', 'sent')
                .neq('sender', userid);
            if (messagesError) {
                console.error('❌ Error fetching undelivered messages:', messagesError.message);
            }
            else if (messages.length > 0) {
                const messageIds = messages.map(msg => msg.id);
                const { error: updateError } = yield app_1.supabase
                    .from('chatmessages')
                    .update({ status: 'delivered' })
                    .in('id', messageIds);
                if (updateError) {
                    console.error('❌ Error updating message statuses:', updateError.message);
                }
                else {
                    for (const message of messages) {
                        const senderEmail = yield (0, getUserFriends_1.getUserEmailFromId)(message.sender);
                        if (senderEmail) {
                            const senderSockets = exports.connectedUsers.get(senderEmail);
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
            const onlineFriends = friends.filter(friend => exports.connectedUsers.has(friend) && exports.connectedUsers.get(friend).size > 0);
            if (onlineFriends.length > 0) {
                console.log(`🟢 Notifying ${email} about online friends:`, onlineFriends);
                onlineFriends.forEach(friendEmail => {
                    socket.emit('friend_online', friendEmail);
                });
            }
        }));
        // --------------------- Story Views ------------------
        socket.on('record_story_view', (_a) => __awaiter(void 0, [_a], void 0, function* ({ storyId }) {
            var _b;
            try {
                console.log('story_view', storyId);
                let userEmail = null;
                let userId = null;
                for (const [email, sockets] of exports.connectedUsers.entries()) {
                    if (sockets.has(socket.id)) {
                        userEmail = email;
                        break;
                    }
                }
                if (!userEmail) {
                    console.error('User not found in connected users');
                    return;
                }
                // Get viewer's user ID
                userId = yield (0, getUserFriends_1.getUserIdFromEmail)(userEmail);
                if (!userId) {
                    console.error('User ID not found for email:', userEmail);
                    return;
                }
                // Get story details
                const { data: story, error: storyError } = yield app_1.supabase
                    .from('stories')
                    .select('user_id, view_count')
                    .eq('id', storyId)
                    .single();
                if (storyError || !story) {
                    console.error('Story not found:', storyError === null || storyError === void 0 ? void 0 : storyError.message);
                    return;
                }
                // Don't record if viewer is the creator
                if (story.user_id === userId) {
                    return;
                }
                // Check if view already exists
                const { data: existingView } = yield app_1.supabase
                    .from('story_views')
                    .select('id')
                    .eq('story_id', storyId)
                    .eq('user_id', userId)
                    .maybeSingle();
                if (existingView) {
                    console.log(`View already exists for story ${storyId} by user ${userId}`);
                    return;
                }
                // Record the new view
                const { data: view, error: viewError } = yield app_1.supabase
                    .from('story_views')
                    .upsert({
                    story_id: storyId,
                    user_id: userId
                }, {
                    onConflict: 'story_id,user_id'
                })
                    .select()
                    .single();
                if (viewError) {
                    console.error('View recording failed:', viewError.message);
                    return;
                }
                // Get updated view count
                const { count: viewCount } = yield app_1.supabase
                    .from('story_views')
                    .select('*', { count: 'exact' })
                    .eq('story_id', storyId);
                // Get creator's email
                const creatorEmail = yield (0, getUserFriends_1.getUserEmailFromId)(story.user_id);
                if (!creatorEmail)
                    return;
                // Get viewer details
                const { data: viewer, error: viewerError } = yield app_1.supabase
                    .from('profiles')
                    .select('id, first_name, last_name, avatar_url')
                    .eq('id', userId)
                    .single();
                if (viewerError || !viewer) {
                    console.error('Error fetching viewer details:', viewerError === null || viewerError === void 0 ? void 0 : viewerError.message);
                    return;
                }
                // Prepare view data
                const viewData = {
                    storyId,
                    viewId: view.id,
                    viewedAt: new Date().toISOString(),
                    viewer,
                    viewCount: viewCount || 0
                };
                // Notify the creator if online
                const creatorSockets = exports.connectedUsers.get(creatorEmail);
                if (creatorSockets) {
                    creatorSockets.forEach(socketId => {
                        io.to(socketId).emit('story_viewed', viewData);
                    });
                }
                // Also emit to the viewer to update their local state
                if (exports.connectedUsers.has(userEmail)) {
                    (_b = exports.connectedUsers.get(userEmail)) === null || _b === void 0 ? void 0 : _b.forEach(socketId => {
                        io.to(socketId).emit('story_view_update', viewData);
                    });
                }
                console.log(`👀 View recorded for story ${storyId} by ${userEmail}`);
            }
            catch (error) {
                console.error('Error in record_story_view:', error);
            }
        }));
        // --------------------- 1-1 Chat Events ------------------
        // Send a message
        socket.on('send_message', (payload) => __awaiter(void 0, void 0, void 0, function* () {
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
                const { data: insertedMessage, error: insertError } = yield app_1.supabase
                    .from('chatmessages')
                    .insert([messageData])
                    .select()
                    .single();
                if (insertError || !insertedMessage) {
                    throw new Error((insertError === null || insertError === void 0 ? void 0 : insertError.message) || 'Failed to insert message');
                }
                yield app_1.supabase
                    .from('chats')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', chat_id);
                const receiverSockets = exports.connectedUsers.get(receiver_email);
                if (receiverSockets) {
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('receive_message', insertedMessage);
                    });
                }
                socket.emit('message_sent', insertedMessage);
                yield (0, getUserFriends_1.updateUnseenCountForUser)(receiver_email);
            }
            catch (error) {
                console.error('Message send error:', error);
                socket.emit('message_error', {
                    error: error instanceof Error ? error.message : 'Failed to send message'
                });
            }
        }));
        // Message delivered
        socket.on('message_delivered', (_a) => __awaiter(void 0, [_a], void 0, function* ({ messageId, userId }) {
            const { error } = yield app_1.supabase
                .from('chatmessages')
                .update({ status: 'delivered' })
                .eq('id', messageId);
            if (error) {
                console.error('Delivery update error:', error.message);
                return;
            }
            const { data: message } = yield app_1.supabase
                .from('chatmessages')
                .select('sender')
                .eq('id', messageId)
                .single();
            if (message) {
                const senderEmail = yield (0, getUserFriends_1.getUserEmailFromId)(message.sender);
                if (senderEmail && exports.connectedUsers.has(senderEmail)) {
                    exports.connectedUsers.get(senderEmail).forEach(socketId => {
                        io.to(socketId).emit('message_status_update', {
                            messageId,
                            status: 'delivered'
                        });
                    });
                }
            }
        }));
        // Get unseen messages count
        socket.on('get_unseen_count', (userId) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log('userId', userId);
                const unseenCount = yield (0, getUserFriends_1.getUnseenMessagesCount)(userId);
                console.log(unseenCount);
                socket.emit('unseen_count_update', { count: unseenCount });
            }
            catch (error) {
                console.error('Unseen count error:', error);
                socket.emit('unseen_count_error', {
                    error: error instanceof Error ? error.message : 'Failed to get unseen count'
                });
            }
        }));
        // Message seen
        socket.on('message_seen', (_a) => __awaiter(void 0, [_a], void 0, function* ({ messageId, userId }) {
            try {
                const { error } = yield app_1.supabase
                    .from('chatmessages')
                    .update({ status: 'seen' })
                    .eq('id', messageId);
                if (error) {
                    console.error('Seen update error:', error.message);
                    return;
                }
                const { data: message } = yield app_1.supabase
                    .from('chatmessages')
                    .select('sender, chat_id')
                    .eq('id', messageId)
                    .single();
                if (message) {
                    const senderEmail = yield (0, getUserFriends_1.getUserEmailFromId)(message.sender);
                    if (senderEmail && exports.connectedUsers.has(senderEmail)) {
                        exports.connectedUsers.get(senderEmail).forEach(socketId => {
                            io.to(socketId).emit('message_status_update', {
                                messageId,
                                status: 'seen'
                            });
                        });
                    }
                    yield (0, getUserFriends_1.updateUnseenCountForChatParticipants)(message.chat_id);
                }
            }
            catch (error) {
                console.error('Message seen error:', error);
            }
        }));
        // Delete message
        socket.on('delete_message', (_a) => __awaiter(void 0, [_a], void 0, function* ({ messageId, userId }) {
            const { data: message } = yield app_1.supabase
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
            const { error } = yield app_1.supabase
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
            const { data: chat } = yield app_1.supabase
                .from('chats')
                .select('user_1, user_2')
                .eq('id', message.chat_id)
                .single();
            if (chat) {
                const [user1Email, user2Email] = yield Promise.all([
                    (0, getUserFriends_1.getUserEmailFromId)(chat.user_1),
                    (0, getUserFriends_1.getUserEmailFromId)(chat.user_2)
                ]);
                const payload = { messageId, deletedBy: userId };
                [user1Email, user2Email].forEach(email => {
                    if (email && exports.connectedUsers.has(email)) {
                        exports.connectedUsers.get(email).forEach(socketId => {
                            io.to(socketId).emit('message_deleted', payload);
                        });
                    }
                });
            }
        }));
        // Edit message
        socket.on('edit_message', (_a) => __awaiter(void 0, [_a], void 0, function* ({ messageId, sender, newMessage }) {
            const { data: message } = yield app_1.supabase
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
            const { data: editedData, error } = yield app_1.supabase
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
            const { data: chat } = yield app_1.supabase
                .from('chats')
                .select('id, user_1, user_2')
                .eq('id', message.chat_id)
                .single();
            if (chat) {
                const [user1Email, user2Email] = yield Promise.all([
                    (0, getUserFriends_1.getUserEmailFromId)(chat.user_1),
                    (0, getUserFriends_1.getUserEmailFromId)(chat.user_2)
                ]);
                const payload = {
                    messageId,
                    newMessage,
                    editedBy: sender,
                    editedAt: editedData === null || editedData === void 0 ? void 0 : editedData.edited_at,
                    previousContent: message.message,
                    chatId: chat.id,
                    sender: sender,
                };
                [user1Email, user2Email].forEach(email => {
                    if (email && exports.connectedUsers.has(email)) {
                        exports.connectedUsers.get(email).forEach(socketId => {
                            io.to(socketId).emit('message_edited', payload);
                        });
                    }
                });
            }
        }));
        // Typing indicators
        socket.on('typing', ({ chatId, userId, receiver_email }) => {
            if (receiver_email && exports.connectedUsers.has(receiver_email)) {
                exports.connectedUsers.get(receiver_email).forEach(socketId => {
                    io.to(socketId).emit('user_typing', { chatId, userId });
                });
            }
        });
        // stop typing
        socket.on('stop_typing', ({ chatId, userId, receiver_email }) => {
            if (receiver_email && exports.connectedUsers.has(receiver_email)) {
                exports.connectedUsers.get(receiver_email).forEach(socketId => {
                    io.to(socketId).emit('user_stop_typing', { chatId, userId });
                });
            }
        });
        // Add reaction
        socket.on('add_reaction', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const { messageId, emoji, userId } = payload;
            try {
                const { data: existingReaction } = yield app_1.supabase
                    .from('chat_reactions')
                    .select()
                    .eq('target_id', messageId)
                    .eq('user_id', userId)
                    .eq('type', emoji)
                    .maybeSingle();
                let action = 'add';
                if (existingReaction) {
                    const { error: deleteError } = yield app_1.supabase
                        .from('chat_reactions')
                        .delete()
                        .eq('id', existingReaction.id);
                    if (deleteError)
                        throw deleteError;
                    action = 'remove';
                }
                else {
                    const { error: insertError } = yield app_1.supabase
                        .from('chat_reactions')
                        .insert([{
                            user_id: userId,
                            target_id: messageId,
                            target_type: 'chat_message',
                            type: emoji
                        }]);
                    if (insertError)
                        throw insertError;
                    action = 'add';
                }
                const { data: reactions } = yield app_1.supabase
                    .from('chat_reactions')
                    .select('user_id, type')
                    .eq('target_id', messageId);
                const reactionMap = reactions === null || reactions === void 0 ? void 0 : reactions.reduce((acc, reaction) => {
                    if (!acc[reaction.type])
                        acc[reaction.type] = [];
                    acc[reaction.type].push(reaction.user_id);
                    return acc;
                }, {});
                const { data: message } = yield app_1.supabase
                    .from('chatmessages')
                    .select('chat_id, sender')
                    .eq('id', messageId)
                    .single();
                if (!message)
                    throw new Error('Message not found');
                const { data: chat } = yield app_1.supabase
                    .from('chats')
                    .select('user_1, user_2')
                    .eq('id', message.chat_id)
                    .single();
                const participants = chat ? [chat.user_1, chat.user_2] : [];
                const reactionPayload = {
                    messageId,
                    emoji,
                    userId,
                    action,
                    reactions: reactionMap || {}
                };
                participants.forEach((participantId) => __awaiter(void 0, void 0, void 0, function* () {
                    const email = yield (0, getUserFriends_1.getUserEmailFromId)(participantId);
                    if (email && exports.connectedUsers.has(email)) {
                        exports.connectedUsers.get(email).forEach(socketId => {
                            io.to(socketId).emit('reaction_update', reactionPayload);
                        });
                    }
                }));
                socket.emit('reaction_update', reactionPayload);
            }
            catch (error) {
                console.error('Reaction error:', error);
                socket.emit('reaction_error', {
                    error: error instanceof Error ? error.message : 'Failed to update reaction'
                });
            }
        }));
        // --------------------- Public Chat Events ------------------
        // Send a public message
        socket.on('public_send_message', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const { sender_id, message, reply_to } = payload;
            try {
                // Validate message length
                if (!message.trim() || message.length > 1000) {
                    throw new Error('Message must be between 1 and 1000 characters');
                }
                // Validate reply_to exists if provided
                if (reply_to) {
                    const { data: repliedMessage, error: replyError } = yield app_1.supabase
                        .from('public_chat')
                        .select('id')
                        .eq('id', reply_to)
                        .is('is_deleted', false)
                        .single();
                    if (replyError || !repliedMessage) {
                        throw new Error('Original message not found or has been deleted');
                    }
                }
                const messageData = {
                    sender_id,
                    message,
                    reply_to: reply_to || null,
                    is_edited: false,
                    is_deleted: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    deleted_at: null
                };
                // First insert the base message without the reply_to to avoid circular reference
                const { data: insertedMessage, error: insertError } = yield app_1.supabase
                    .from('public_chat')
                    .insert([Object.assign(Object.assign({}, messageData), { reply_to: null })])
                    .select()
                    .single();
                if (insertError || !insertedMessage) {
                    throw new Error((insertError === null || insertError === void 0 ? void 0 : insertError.message) || 'Failed to insert public message');
                }
                // If there's a reply_to, update the message with the correct reference
                if (reply_to) {
                    const { error: updateError } = yield app_1.supabase
                        .from('public_chat')
                        .update({ reply_to })
                        .eq('id', insertedMessage.id);
                    if (updateError) {
                        // Rollback the insertion if update fails
                        yield app_1.supabase
                            .from('public_chat')
                            .delete()
                            .eq('id', insertedMessage.id);
                        throw new Error(updateError.message || 'Failed to set message reply');
                    }
                    // Refetch the complete message with reply data
                    const { data: updatedMessage } = yield app_1.supabase
                        .from('public_chat')
                        .select(`
          *,
          replied_message:public_chat!reply_to (
            id,
            message,
            sender_id,
            profiles:profiles!public_chat_sender_id_fkey (
              id,
              first_name,
              last_name,
              avatar_url
            )
          )
        `)
                        .eq('id', insertedMessage.id)
                        .single();
                    if (updatedMessage) {
                        insertedMessage.reply_to = reply_to;
                        insertedMessage.replied_message = updatedMessage.replied_message;
                    }
                }
                const { data: senderProfile } = yield app_1.supabase
                    .from('profiles')
                    .select('id, first_name, last_name, avatar_url')
                    .eq('id', sender_id)
                    .single();
                const completeMessage = Object.assign(Object.assign({}, insertedMessage), { sender: senderProfile, replied_message: insertedMessage.replied_message ? Object.assign(Object.assign({}, insertedMessage.replied_message), { sender: insertedMessage.replied_message.profiles }) : null });
                if (completeMessage.replied_message) {
                    delete completeMessage.replied_message.profiles;
                }
                io.emit('public_receive_message', completeMessage);
                socket.emit('public_message_sent', completeMessage);
            }
            catch (error) {
                console.error('Public message send error:', error);
                socket.emit('public_message_error', {
                    error: error instanceof Error ? error.message : 'Failed to send public message'
                });
            }
        }));
        // Edit public message
        socket.on('public_edit_message', (_a) => __awaiter(void 0, [_a], void 0, function* ({ messageId, sender_id, newMessage }) {
            const { data: message } = yield app_1.supabase
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
            const { data: editedData, error } = yield app_1.supabase
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
                updated_at: editedData === null || editedData === void 0 ? void 0 : editedData.updated_at
            });
        }));
        // Delete public message
        socket.on('public_delete_message', (_a) => __awaiter(void 0, [_a], void 0, function* ({ messageId, sender_id }) {
            const { data: message } = yield app_1.supabase
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
            const { error } = yield app_1.supabase
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
        }));
        // Public chat typing indicators
        socket.on('public_typing', ({ sender_id }) => {
            socket.broadcast.emit('public_user_typing', sender_id);
        });
        socket.on('public_stop_typing', ({ sender_id }) => {
            socket.broadcast.emit('public_user_stop_typing', sender_id);
        });
        // Public user online status
        socket.on('public_user_online', (userId) => {
            socket.broadcast.emit('public_user_online', userId);
        });
        socket.on('public_user_offline', (userId) => {
            socket.broadcast.emit('public_user_offline', userId);
        });
        // Add reaction
        socket.on('public_add_reaction', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const { messageId, emoji, userId } = payload;
            try {
                const { data: existingReaction } = yield app_1.supabase
                    .from('chat_reactions')
                    .select()
                    .eq('target_id', messageId)
                    .eq('user_id', userId)
                    .eq('type', emoji)
                    .maybeSingle();
                if (existingReaction) {
                    const { error: deleteError } = yield app_1.supabase
                        .from('chat_reactions')
                        .delete()
                        .eq('id', existingReaction.id);
                    if (deleteError)
                        throw deleteError;
                }
                else {
                    const { error: insertError } = yield app_1.supabase
                        .from('chat_reactions')
                        .insert([{
                            user_id: userId,
                            target_id: messageId,
                            target_type: 'public_chat_message',
                            type: emoji
                        }]);
                    if (insertError)
                        throw insertError;
                }
                const { data: reactions } = yield app_1.supabase
                    .from('chat_reactions')
                    .select('user_id, type')
                    .eq('target_id', messageId);
                const reactionMap = reactions === null || reactions === void 0 ? void 0 : reactions.reduce((acc, reaction) => {
                    if (!acc[reaction.type])
                        acc[reaction.type] = [];
                    acc[reaction.type].push(reaction.user_id);
                    return acc;
                }, {});
                const { data: message } = yield app_1.supabase
                    .from('public_chat')
                    .select('id')
                    .eq('id', messageId)
                    .single();
                if (!message)
                    throw new Error('Message not found');
                io.emit('public_reaction_update', {
                    messageId,
                    reactions: reactionMap || {}
                });
            }
            catch (error) {
                console.error('Reaction error:', error);
                socket.emit('reaction_error', {
                    error: error instanceof Error ? error.message : 'Failed to update reaction'
                });
            }
        }));
        // --------------------- Public Chat Events ------------------
        // Send a public message
        socket.on('travel_send_message', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const { sender_id, message, reply_to } = payload;
            try {
                const messageData = {
                    sender_id,
                    message,
                    reply_to,
                    is_edited: false,
                    is_deleted: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    deleted_at: null
                };
                const { data: insertedMessage, error: insertError } = yield app_1.supabase
                    .from('travel_chat')
                    .insert([messageData])
                    .select()
                    .single();
                if (insertError || !insertedMessage) {
                    throw new Error((insertError === null || insertError === void 0 ? void 0 : insertError.message) || 'Failed to insert public message');
                }
                const { data: senderProfile } = yield app_1.supabase
                    .from('profiles')
                    .select('id, first_name, last_name, avatar_url')
                    .eq('id', sender_id)
                    .single();
                const completeMessage = Object.assign(Object.assign({}, insertedMessage), { sender: senderProfile });
                io.emit('travel_receive_message', completeMessage);
                socket.emit('travel_message_sent', completeMessage);
            }
            catch (error) {
                console.error('Public message send error:', error);
                socket.emit('travel_message_error', {
                    error: error instanceof Error ? error.message : 'Failed to send public message'
                });
            }
        }));
        // Edit public message
        socket.on('travel_edit_message', (_a) => __awaiter(void 0, [_a], void 0, function* ({ messageId, sender_id, newMessage }) {
            const { data: message } = yield app_1.supabase
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
            const { data: editedData, error } = yield app_1.supabase
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
                updated_at: editedData === null || editedData === void 0 ? void 0 : editedData.updated_at
            });
        }));
        // Delete public message
        socket.on('travel_delete_message', (_a) => __awaiter(void 0, [_a], void 0, function* ({ messageId, sender_id }) {
            const { data: message } = yield app_1.supabase
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
            const { error } = yield app_1.supabase
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
        }));
        // Public chat typing indicators
        socket.on('travel_typing', ({ sender_id }) => {
            socket.broadcast.emit('travel_user_typing', sender_id);
        });
        socket.on('travel_stop_typing', ({ sender_id }) => {
            socket.broadcast.emit('travel_user_stop_typing', sender_id);
        });
        // Public user online status
        socket.on('travel_user_online', (userId) => {
            socket.broadcast.emit('travel_user_online', userId);
        });
        socket.on('travel_user_offline', (userId) => {
            socket.broadcast.emit('travel_user_offline', userId);
        });
        // Add reaction
        socket.on('travel_add_reaction', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const { messageId, emoji, userId } = payload;
            try {
                const { data: existingReaction } = yield app_1.supabase
                    .from('chat_reactions')
                    .select()
                    .eq('target_id', messageId)
                    .eq('user_id', userId)
                    .eq('type', emoji)
                    .maybeSingle();
                if (existingReaction) {
                    const { error: deleteError } = yield app_1.supabase
                        .from('chat_reactions')
                        .delete()
                        .eq('id', existingReaction.id);
                    if (deleteError)
                        throw deleteError;
                }
                else {
                    const { error: insertError } = yield app_1.supabase
                        .from('chat_reactions')
                        .insert([{
                            user_id: userId,
                            target_id: messageId,
                            target_type: 'travel_chat_message',
                            type: emoji
                        }]);
                    if (insertError)
                        throw insertError;
                }
                const { data: reactions } = yield app_1.supabase
                    .from('chat_reactions')
                    .select('user_id, type')
                    .eq('target_id', messageId);
                const reactionMap = reactions === null || reactions === void 0 ? void 0 : reactions.reduce((acc, reaction) => {
                    if (!acc[reaction.type])
                        acc[reaction.type] = [];
                    acc[reaction.type].push(reaction.user_id);
                    return acc;
                }, {});
                const { data: message } = yield app_1.supabase
                    .from('travel_chat')
                    .select('id')
                    .eq('id', messageId)
                    .single();
                if (!message)
                    throw new Error('Message not found');
                io.emit('travel_reaction_update', {
                    messageId,
                    reactions: reactionMap || {}
                });
            }
            catch (error) {
                console.error('Reaction error:', error);
                socket.emit('reaction_error', {
                    error: error instanceof Error ? error.message : 'Failed to update reaction'
                });
            }
        }));
        // --------------------- Chambers Events ------------------
        // Join a chamber (group)
        socket.on('chamber_join', (payload, callback) => __awaiter(void 0, void 0, void 0, function* () {
            const { chamber_id, user_id, invite_code } = payload;
            try {
                // 1. Check existing membership
                const { data: existingMember } = yield app_1.supabase
                    .from('chamber_members')
                    .select('user_id')
                    .eq('chamber_id', chamber_id)
                    .eq('user_id', user_id)
                    .single();
                if (existingMember) {
                    callback({ success: false, error: 'You are already a member' });
                    return;
                }
                // 2. Get chamber info
                const { data: chamber, error: chamberError } = yield app_1.supabase
                    .from('custom_chambers')
                    .select('id, is_public, is_active, member_count')
                    .eq('id', chamber_id)
                    .single();
                if (chamberError || !chamber) {
                    callback({ success: false, error: 'Chamber not found' });
                    return;
                }
                if (!chamber.is_active) {
                    callback({ success: false, error: 'Chamber is inactive' });
                    return;
                }
                // 3. Handle private chambers
                if (!chamber.is_public) {
                    // Case 1: Using invite code
                    if (invite_code) {
                        const { data: validInvite } = yield app_1.supabase
                            .from('chamber_invites')
                            .select('id')
                            .eq('chamber_id', chamber_id)
                            .eq('invite_code', invite_code)
                            .eq('status', 'pending')
                            .gte('expires_at', new Date().toISOString())
                            .single();
                        if (!validInvite) {
                            callback({ success: false, error: 'Invalid or expired invite' });
                            return;
                        }
                    }
                    // Case 2: No invite - create join request
                    else {
                        const { error } = yield app_1.supabase
                            .from('chamber_invites')
                            .insert({
                            chamber_id,
                            user_id,
                            status: 'pending',
                            request_type: 'join_request',
                            invite_code: null // Explicitly set to null
                        });
                        if (error)
                            throw error;
                        callback({
                            success: true,
                            is_pending: true,
                            error: 'Join request submitted for approval'
                        });
                        return;
                    }
                }
                // 4. Add user to chamber
                const { error: joinError } = yield app_1.supabase
                    .from('chamber_members')
                    .insert({
                    chamber_id,
                    user_id,
                    joined_at: new Date().toISOString(),
                    is_moderator: false
                });
                if (joinError)
                    throw joinError;
                // 5. Update invite if used
                if (invite_code) {
                    yield app_1.supabase
                        .from('chamber_invites')
                        .update({
                        status: 'accepted',
                        user_id
                    })
                        .eq('invite_code', invite_code);
                }
                // 6. Update member count
                const { data: updatedChamber } = yield app_1.supabase
                    .from('custom_chambers')
                    .update({ member_count: (chamber.member_count || 0) + 1 })
                    .eq('id', chamber_id)
                    .select('*')
                    .single();
                socket.join(`chamber_${chamber_id}`);
                callback({
                    success: true,
                    chamber: updatedChamber,
                    member_count: updatedChamber === null || updatedChamber === void 0 ? void 0 : updatedChamber.member_count
                });
            }
            catch (error) {
                console.error('Join error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to join'
                });
            }
        }));
        // Leave a chamber
        socket.on('chamber_leave', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const { chamber_id, user_id } = payload;
            // Get user profile before leaving
            const { data: userProfile } = yield app_1.supabase
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
        }));
        // Send a message to a chamber (with reply support)
        socket.on('chamber_send_message', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { chamber_id, sender_id, message, has_media, media, reply_to } = payload;
                const { isCreator, isModerator } = yield (0, manageChambers_1.verifyChamberPermissions)(chamber_id, sender_id);
                if (!isCreator && !isModerator) {
                    const { data: membership } = yield app_1.supabase
                        .from('chamber_members')
                        .select('user_id')
                        .eq('chamber_id', chamber_id)
                        .eq('user_id', sender_id)
                        .single();
                    if (!membership) {
                        socket.emit('chamber_message_error', {
                            chamber_id,
                            error: 'Not authorized to send messages to this chamber'
                        });
                        return;
                    }
                }
                // At least one of message or media must be present
                if ((!message || message.trim().length === 0) && (!has_media || !media || media.length === 0)) {
                    socket.emit('chamber_message_error', {
                        chamber_id,
                        error: 'Message text or media file is required'
                    });
                    return;
                }
                if (message && message.length > 2000) {
                    socket.emit('chamber_message_error', {
                        chamber_id,
                        error: 'Message must be 2000 characters or less'
                    });
                    return;
                }
                if (reply_to) {
                    const { data: parentMessage } = yield app_1.supabase
                        .from('chamber_messages')
                        .select('id')
                        .eq('id', reply_to)
                        .eq('chamber_id', chamber_id)
                        .single();
                    if (!parentMessage) {
                        socket.emit('chamber_message_error', {
                            chamber_id,
                            error: 'The message you are replying to does not exist in this chamber'
                        });
                        return;
                    }
                }
                const { data: insertedMessage } = yield app_1.supabase
                    .from('chamber_messages')
                    .insert([{
                        chamber_id,
                        sender_id,
                        message: message && message.trim().length > 0 ? message : null,
                        has_media,
                        media: has_media && media && media.length > 0 ? media : null,
                        reply_to: reply_to || null,
                        is_edited: false,
                        is_deleted: false,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }])
                    .select()
                    .single();
                if (!insertedMessage) {
                    throw new Error('Failed to insert chamber message');
                }
                const { data: senderProfile } = yield app_1.supabase
                    .from('profiles')
                    .select('id, first_name, last_name, avatar_url')
                    .eq('id', sender_id)
                    .single();
                const completeMessage = Object.assign(Object.assign({}, insertedMessage), { sender: senderProfile });
                if (reply_to) {
                    const { data: parentMessage } = yield app_1.supabase
                        .from('chamber_messages')
                        .select('id, sender_id, message')
                        .eq('id', reply_to)
                        .single();
                    if (parentMessage) {
                        const { data: parentSender } = yield app_1.supabase
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
                yield app_1.supabase
                    .from('custom_chambers')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', chamber_id);
                yield (0, manageChambers_1.notifyChamberMembers)(chamber_id, 'chamber_receive_message', completeMessage);
                socket.emit('chamber_message_confirmed', {
                    chamber_id,
                    message_id: insertedMessage.id
                });
            }
            catch (error) {
                console.error('Chamber message send error:', error);
                socket.emit('chamber_message_error', {
                    chamber_id: payload.chamber_id,
                    error: error instanceof Error ? error.message : 'Failed to send chamber message'
                });
            }
        }));
        // Edit chamber message
        socket.on('chamber_edit_message', (_a) => __awaiter(void 0, [_a], void 0, function* ({ chamber_id, messageId, sender_id, newMessage }) {
            try {
                // Get message and verify permissions
                const { data: message } = yield app_1.supabase
                    .from('chamber_messages')
                    .select('sender_id, chamber_id')
                    .eq('id', messageId)
                    .single();
                if (!message || message.chamber_id !== chamber_id) {
                    throw new Error('Message not found in this chamber');
                }
                // Check if user is sender or moderator
                const { data: membership } = yield app_1.supabase
                    .from('chamber_members')
                    .select('is_moderator')
                    .eq('chamber_id', chamber_id)
                    .eq('user_id', sender_id)
                    .single();
                if (message.sender_id !== sender_id && (!membership || !membership.is_moderator)) {
                    throw new Error('Not authorized to edit this message');
                }
                const { data: editedData, error } = yield app_1.supabase
                    .from('chamber_messages')
                    .update({
                    message: newMessage,
                    is_edited: true,
                    updated_at: new Date().toISOString(),
                })
                    .eq('id', messageId)
                    .select()
                    .single();
                if (error)
                    throw error;
                // Broadcast to everyone in the chamber
                io.to(`chamber_${chamber_id}`).emit('chamber_message_edited', {
                    id: messageId,
                    message: newMessage,
                    updated_at: editedData === null || editedData === void 0 ? void 0 : editedData.updated_at,
                    chamber_id,
                    edited_by: sender_id
                });
                // Update chamber's last activity timestamp
                yield app_1.supabase
                    .from('custom_chambers')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', chamber_id);
            }
            catch (error) {
                console.error('Chamber message edit error:', error);
                socket.emit('chamber_edit_message_error', {
                    chamber_id,
                    messageId,
                    error: error instanceof Error ? error.message : 'Failed to edit message'
                });
            }
        }));
        // Delete chamber message
        socket.on('chamber_delete_message', (_a) => __awaiter(void 0, [_a], void 0, function* ({ chamber_id, messageId, sender_id }) {
            try {
                // Get message and verify permissions
                const { data: message } = yield app_1.supabase
                    .from('chamber_messages')
                    .select('sender_id, chamber_id')
                    .eq('id', messageId)
                    .single();
                if (!message || message.chamber_id !== chamber_id) {
                    throw new Error('Message not found in this chamber');
                }
                // Check if user is sender or moderator
                const { data: membership } = yield app_1.supabase
                    .from('chamber_members')
                    .select('is_moderator')
                    .eq('chamber_id', chamber_id)
                    .eq('user_id', sender_id)
                    .single();
                if (message.sender_id !== sender_id && (!membership || !membership.is_moderator)) {
                    throw new Error('Not authorized to delete this message');
                }
                const { error } = yield app_1.supabase
                    .from('chamber_messages')
                    .update({
                    is_deleted: true,
                    deleted_at: new Date().toISOString()
                })
                    .eq('id', messageId);
                if (error)
                    throw error;
                // Broadcast to everyone in the chamber
                io.to(`chamber_${chamber_id}`).emit('chamber_message_deleted', {
                    id: messageId,
                    deleted_at: new Date().toISOString(),
                    chamber_id,
                    deleted_by: sender_id
                });
                // Update chamber's last activity timestamp
                yield app_1.supabase
                    .from('custom_chambers')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', chamber_id);
            }
            catch (error) {
                console.error('Chamber message delete error:', error);
                socket.emit('chamber_delete_message_error', {
                    chamber_id,
                    messageId,
                    error: error instanceof Error ? error.message : 'Failed to delete message'
                });
            }
        }));
        // Chamber typing indicators
        socket.on('chamber_typing', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { chamber_id, sender_id } = payload;
                if (!chamber_id || !sender_id) {
                    throw new Error('Missing required fields');
                }
                const typingPayload = {
                    chamber_id,
                    sender_id,
                    timestamp: new Date().toISOString()
                };
                yield (0, manageChambers_1.notifyChamberMembers)(chamber_id, 'chamber_user_typing', typingPayload);
            }
            catch (error) {
                console.error('Typing indicator error:', error);
            }
        }));
        socket.on('chamber_stop_typing', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { chamber_id, sender_id } = payload;
                if (!chamber_id || !sender_id) {
                    throw new Error('Missing required fields');
                }
                const stopTypingPayload = {
                    chamber_id,
                    sender_id,
                    timestamp: new Date().toISOString()
                };
                yield (0, manageChambers_1.notifyChamberMembers)(chamber_id, 'chamber_user_stop_typing', stopTypingPayload);
            }
            catch (error) {
                console.error('Stop typing indicator error:', error);
            }
        }));
        // Chamber name update
        socket.on('chamber_update_name', (payload, callback) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { chamber_id, new_name, updated_by } = payload;
                // Input validation
                if (!chamber_id || !new_name || !updated_by) {
                    throw new Error('Missing required fields');
                }
                if (new_name.length > 100) {
                    throw new Error('Name must be 100 characters or less');
                }
                const { isCreator, isModerator } = yield (0, manageChambers_1.verifyChamberPermissions)(chamber_id, updated_by);
                // Check name uniqueness
                const { data: existing } = yield app_1.supabase
                    .from('custom_chambers')
                    .select('id')
                    .eq('name', new_name)
                    .neq('id', chamber_id)
                    .single();
                if (existing) {
                    throw new Error('Chamber name already in use');
                }
                // Update database
                const { error } = yield app_1.supabase
                    .from('custom_chambers')
                    .update({
                    name: new_name,
                    updated_at: new Date().toISOString()
                })
                    .eq('id', chamber_id);
                if (error)
                    throw error;
                const updatePayload = {
                    chamber_id,
                    new_name,
                    updated_by,
                    updated_at: new Date().toISOString()
                };
                yield (0, manageChambers_1.notifyChamberMembers)(chamber_id, 'chamber_name_updated', updatePayload);
                callback({ success: true, data: updatePayload });
            }
            catch (error) {
                console.error('Update chamber name error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to update chamber name',
                    code: error.code
                });
            }
        }));
        // Chamber description update
        socket.on('chamber_update_description', (payload, callback) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { chamber_id, new_description, updated_by } = payload;
                if (!chamber_id || !new_description || !updated_by) {
                    throw new Error('Missing required fields');
                }
                const { isCreator, isModerator } = yield (0, manageChambers_1.verifyChamberPermissions)(chamber_id, updated_by);
                // Update database
                const { error } = yield app_1.supabase
                    .from('custom_chambers')
                    .update({
                    description: new_description,
                    updated_at: new Date().toISOString()
                })
                    .eq('id', chamber_id);
                if (error)
                    throw error;
                const updatePayload = {
                    chamber_id,
                    new_description,
                    updated_by,
                    updated_at: new Date().toISOString()
                };
                yield (0, manageChambers_1.notifyChamberMembers)(chamber_id, 'chamber_description_updated', updatePayload);
                callback({ success: true, data: updatePayload });
            }
            catch (error) {
                console.error('Update chamber description error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to update description'
                });
            }
        }));
        // Chamber avatar update
        socket.on('chamber_update_avatar', (payload, callback) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { chamber_id, new_avatar, updated_by } = payload;
                if (!chamber_id || !new_avatar || !updated_by) {
                    throw new Error('Missing required fields');
                }
                const { isCreator, isModerator } = yield (0, manageChambers_1.verifyChamberPermissions)(chamber_id, updated_by);
                // Update database
                const { error } = yield app_1.supabase
                    .from('custom_chambers')
                    .update({
                    chamber_img: new_avatar,
                    updated_at: new Date().toISOString()
                })
                    .eq('id', chamber_id);
                if (error)
                    throw error;
                const updatePayload = {
                    chamber_id,
                    new_avatar,
                    updated_by,
                    updated_at: new Date().toISOString()
                };
                yield (0, manageChambers_1.notifyChamberMembers)(chamber_id, 'chamber_avatar_updated', updatePayload);
                callback({ success: true, data: updatePayload });
            }
            catch (error) {
                console.error('Update chamber avatar error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to update avatar'
                });
            }
        }));
        // Chamber member events
        socket.on('chamber_add_members', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const { chamber_id, user_ids, adder_id } = payload;
            console.log('Adding members:', { chamber_id, user_ids, adder_id });
            try {
                const { isCreator, isModerator } = yield (0, manageChambers_1.verifyChamberPermissions)(chamber_id, adder_id);
                if (!isCreator && !isModerator) {
                    socket.emit('chamber_member_error', {
                        chamber_id,
                        error: 'Not authorized to add members',
                        adder_id
                    });
                    return;
                }
                const { data: existingMembers } = yield app_1.supabase
                    .from('chamber_members')
                    .select('user_id')
                    .eq('chamber_id', chamber_id)
                    .in('user_id', user_ids);
                const existingUserIds = (existingMembers === null || existingMembers === void 0 ? void 0 : existingMembers.map(m => m.user_id)) || [];
                const newUserIds = user_ids.filter(id => !existingUserIds.includes(id));
                if (newUserIds.length === 0) {
                    socket.emit('chamber_member_error', {
                        chamber_id,
                        error: 'All users are already members',
                        adder_id,
                        existingUserIds
                    });
                    return;
                }
                const { error } = yield app_1.supabase
                    .from('chamber_members')
                    .insert(newUserIds.map(user_id => ({
                    chamber_id,
                    user_id,
                    joined_at: new Date().toISOString(),
                    is_moderator: false
                })));
                if (error)
                    throw error;
                yield app_1.supabase.rpc('increment_member_count', {
                    chamber_id,
                    count: newUserIds.length
                });
                const { data: userProfiles } = yield app_1.supabase
                    .from('profiles')
                    .select('id, first_name, last_name, avatar_url')
                    .in('id', newUserIds);
                if (!userProfiles || userProfiles.length === 0) {
                    throw new Error('User profiles not found');
                }
                const addedMembersData = {
                    chamber_id,
                    added_users: userProfiles,
                    added_by: adder_id,
                    timestamp: new Date().toISOString()
                };
                yield (0, manageChambers_1.notifyChamberMembers)(chamber_id, 'chamber_members_added', addedMembersData);
                socket.emit('chamber_members_add_confirmed', Object.assign(Object.assign({}, addedMembersData), { skipped_users: existingUserIds }));
            }
            catch (error) {
                console.error('Add members error:', error);
                socket.emit('chamber_member_error', {
                    chamber_id,
                    adder_id,
                    error: error instanceof Error ? error.message : 'Failed to add members',
                    attempted_ids: user_ids
                });
            }
        }));
        // Remove a member from a chamber
        socket.on('chamber_remove_member', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { chamber_id, user_id, removed_by } = payload;
                console.log('Removing member:', { chamber_id, user_id, removed_by });
                const { isCreator, isModerator } = yield (0, manageChambers_1.verifyChamberPermissions)(chamber_id, removed_by);
                if (!isCreator && !isModerator) {
                    socket.emit('chamber_member_remove_error', {
                        chamber_id,
                        error: 'Not authorized to remove members',
                        removed_by
                    });
                    return;
                }
                const { data: chamber } = yield app_1.supabase
                    .from('custom_chambers')
                    .select('creator_id')
                    .eq('id', chamber_id)
                    .single();
                if ((chamber === null || chamber === void 0 ? void 0 : chamber.creator_id) === user_id) {
                    socket.emit('chamber_member_remove_error', {
                        chamber_id,
                        error: 'Cannot remove chamber creator',
                        removed_by
                    });
                    return;
                }
                const { error } = yield app_1.supabase
                    .from('chamber_members')
                    .delete()
                    .eq('chamber_id', chamber_id)
                    .eq('user_id', user_id);
                if (error)
                    throw error;
                yield app_1.supabase.rpc('decrement_member_count', { chamber_id });
                const notificationData = {
                    chamber_id,
                    user_id,
                    removed_by,
                    timestamp: new Date().toISOString()
                };
                yield (0, manageChambers_1.notifyChamberMembers)(chamber_id, 'chamber_member_removed', notificationData);
                // Confirm to remover
                socket.emit('chamber_member_remove_confirmed', Object.assign(Object.assign({}, notificationData), { success: true }));
            }
            catch (error) {
                console.error('Remove member error:', error);
                socket.emit('chamber_member_remove_error', {
                    chamber_id: payload.chamber_id,
                    user_id: payload.user_id,
                    removed_by: payload.removed_by,
                    error: error instanceof Error ? error.message : 'Failed to remove member'
                });
            }
        }));
        // Promote a member to admin
        socket.on('chamber_promote_to_admin', (payload, callback) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { chamber_id, user_id, promoted_by } = payload;
                // Only creator can promote to admin
                const { data: chamber } = yield app_1.supabase
                    .from('custom_chambers')
                    .select('creator_id')
                    .eq('id', chamber_id)
                    .single();
                if ((chamber === null || chamber === void 0 ? void 0 : chamber.creator_id) !== promoted_by) {
                    throw new Error('Only chamber creator can promote to admin');
                }
                // Cannot promote yourself
                if (user_id === promoted_by) {
                    throw new Error('You are already the creator');
                }
                // Promote the member
                const { error } = yield app_1.supabase
                    .from('chamber_members')
                    .update({ is_moderator: true })
                    .eq('chamber_id', chamber_id)
                    .eq('user_id', user_id);
                if (error)
                    throw error;
                // Notify chamber
                io.to(`chamber_${chamber_id}`).emit('chamber_member_promoted', {
                    chamber_id,
                    user_id,
                    promoted_by,
                    timestamp: new Date().toISOString()
                });
                callback({ success: true });
            }
            catch (error) {
                console.error('Promote to admin error:', error);
                callback({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to promote member'
                });
            }
        }));
        // Chamber Deletion
        socket.on('chamber_delete', (payload, callback) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { chamber_id, deleted_by } = payload;
                console.log('Deleting chamber:', { chamber_id, deleted_by });
                const { isCreator } = yield (0, manageChambers_1.verifyChamberPermissions)(chamber_id, deleted_by);
                if (!isCreator) {
                    callback({
                        success: false,
                        error: 'Only chamber creator can delete the chamber'
                    });
                    return;
                }
                const { error } = yield app_1.supabase
                    .from('custom_chambers')
                    .delete()
                    .eq('id', chamber_id);
                if (error)
                    throw error;
                const notificationData = {
                    chamber_id,
                    deleted_by,
                    timestamp: new Date().toISOString()
                };
                // Notify all chamber members
                yield (0, manageChambers_1.notifyChamberMembers)(chamber_id, 'chamber_deleted', notificationData);
                // Disconnect all members from the room
                const sockets = yield io.in(`chamber_${chamber_id}`).fetchSockets();
                sockets.forEach(socket => {
                    socket.leave(`chamber_${chamber_id}`);
                });
                // Confirm to deleter
                callback({ success: true });
            }
            catch (error) {
                console.error('Delete chamber error:', error);
                socket.emit('chamber_delete_error', {
                    chamber_id: payload.chamber_id,
                    deleted_by: payload.deleted_by,
                    error: error instanceof Error ? error.message : 'Failed to delete chamber'
                });
            }
        }));
        // Add reaction
        socket.on('chamber_add_reaction', (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const { messageId, emoji, userId } = payload;
            try {
                const { data: existingReaction } = yield app_1.supabase
                    .from('chat_reactions')
                    .select()
                    .eq('target_id', messageId)
                    .eq('user_id', userId)
                    .eq('type', emoji)
                    .maybeSingle();
                if (existingReaction) {
                    const { error: deleteError } = yield app_1.supabase
                        .from('chat_reactions')
                        .delete()
                        .eq('id', existingReaction.id);
                    if (deleteError)
                        throw deleteError;
                }
                else {
                    const { error: insertError } = yield app_1.supabase
                        .from('chat_reactions')
                        .insert([{
                            user_id: userId,
                            target_id: messageId,
                            target_type: 'chamber_message',
                            type: emoji
                        }]);
                    if (insertError)
                        throw insertError;
                }
                const { data: reactions } = yield app_1.supabase
                    .from('chat_reactions')
                    .select('user_id, type')
                    .eq('target_id', messageId);
                const reactionMap = reactions === null || reactions === void 0 ? void 0 : reactions.reduce((acc, reaction) => {
                    if (!acc[reaction.type])
                        acc[reaction.type] = [];
                    acc[reaction.type].push(reaction.user_id);
                    return acc;
                }, {});
                const { data: message } = yield app_1.supabase
                    .from('chamber_messages')
                    .select('id')
                    .eq('id', messageId)
                    .single();
                if (!message)
                    throw new Error('Message not found');
                io.emit('chamber_reaction_update', {
                    messageId,
                    reactions: reactionMap || {}
                });
            }
            catch (error) {
                console.error('Reaction error:', error);
                socket.emit('reaction_error', {
                    error: error instanceof Error ? error.message : 'Failed to update reaction'
                });
            }
        }));
        // --------------------- Notification Events ------------------
        socket.on('mark_as_read', (_a) => __awaiter(void 0, [_a], void 0, function* ({ id }) {
            const { error } = yield app_1.supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', id);
            if (error) {
                console.error(`❌ mark_as_read error:`, error.message);
            }
            else {
                console.log(`📘 Notification ${id} marked as read`);
            }
        }));
        socket.on('mark_all_as_read', (_a) => __awaiter(void 0, [_a], void 0, function* ({ userId }) {
            const { error } = yield app_1.supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .eq('is_read', false);
            if (error) {
                console.error(`❌ mark_all_as_read error:`, error.message);
            }
            else {
                console.log(`📘 All notifications marked as read for user: ${userId}`);
            }
        }));
        socket.on('delete_notification', (_a) => __awaiter(void 0, [_a], void 0, function* ({ id }) {
            const { error } = yield app_1.supabase
                .from('notifications')
                .delete()
                .eq('id', id);
            if (error) {
                console.error(`❌ delete_notification error:`, error.message);
            }
            else {
                console.log(`🗑️ Notification ${id} deleted`);
            }
        }));
        // --------------------- Disconnect ------------------
        socket.on('disconnect', () => __awaiter(void 0, void 0, void 0, function* () {
            for (const [email, socketSet] of exports.connectedUsers.entries()) {
                if (socketSet.has(socket.id)) {
                    socketSet.delete(socket.id);
                    if (socketSet.size === 0) {
                        exports.connectedUsers.delete(email);
                        // Notify only friends of this user about going offline
                        const friends = yield (0, getUserFriends_1.getUserFriends)(email);
                        for (const friend of friends) {
                            const friendSockets = exports.connectedUsers.get(friend);
                            if (friendSockets) {
                                friendSockets.forEach((socketId) => io.to(socketId).emit('friend_offline', email));
                            }
                        }
                    }
                    console.log(`❌ Disconnected ${socket.id} from ${email}`);
                    break;
                }
            }
        }));
    });
    // Register chess handlers separately
    (0, chess_handler_1.registerChessHandlers)(io);
    (0, chess_ai_handler_1.registerChessAIHandlers)(io);
};
exports.registerSocketHandlers = registerSocketHandlers;
