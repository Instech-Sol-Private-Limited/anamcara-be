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
exports.getChessLeaderboard = exports.getPlayerChessRanking = exports.fetchAllUsers = exports.saveGameResult = exports.getChessGameRoom = exports.createChessRoom = exports.acceptChessInvite = exports.sendChessInvite = void 0;
const app_1 = require("../app");
const game_service_1 = require("../services/game.service");
const sockets_1 = require("../sockets");
const getUserFriends_1 = require("../sockets/getUserFriends");
const sendChessInvite = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const { friend_id, invitee_id, chat_id, game_settings, message } = req.body;
        // Determine the invitee - prioritize friend_id for backward compatibility
        const targetUserId = friend_id || invitee_id;
        if (!targetUserId || !game_settings) {
            res.status(400).json({
                success: false,
                message: 'Missing required fields: friend_id/invitee_id, game_settings'
            });
            return;
        }
        console.log('🎮 Chess invitation request:', {
            friend_id,
            invitee_id,
            targetUserId,
            chat_id,
            game_settings
        });
        // Check if target user exists
        const { data: targetProfile, error: targetError } = yield app_1.supabase
            .from('profiles')
            .select('id, first_name, last_name, email, role')
            .eq('id', targetUserId)
            .single();
        if (targetError || !targetProfile) {
            console.error('❌ Error fetching target user:', targetError);
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
            return;
        }
        console.log('✅ Target user found:', {
            id: targetProfile.id,
            name: `${targetProfile.first_name} ${targetProfile.last_name}`,
            email: targetProfile.email
        });
        // Check if user is trying to invite themselves
        if (targetUserId === userId) {
            res.status(400).json({
                success: false,
                message: 'Cannot invite yourself'
            });
            return;
        }
        // Check if target user is not an admin (optional check)
        if (targetProfile.role === 'admin') {
            res.status(403).json({
                success: false,
                message: 'Cannot invite admin users'
            });
            return;
        }
        let finalChatId = chat_id;
        // If no chat_id provided, check if chat exists or create one
        if (!finalChatId) {
            console.log('🔍 No chat_id provided, checking for existing chat...');
            const { data: existingChat, error: chatCheckError } = yield app_1.supabase
                .from('chats')
                .select('id')
                .or(`and(user_1.eq.${userId},user_2.eq.${targetUserId}),and(user_1.eq.${targetUserId},user_2.eq.${userId})`)
                .maybeSingle();
            if (chatCheckError) {
                console.error('❌ Error checking existing chat:', chatCheckError);
                res.status(500).json({
                    success: false,
                    message: 'Failed to check existing chat'
                });
                return;
            }
            if (existingChat) {
                finalChatId = existingChat.id;
                console.log('✅ Using existing chat:', finalChatId);
            }
            else {
                console.log('🆕 Creating new chat...');
                // Create new chat for random user invitation
                const { data: newChat, error: insertError } = yield app_1.supabase
                    .from('chats')
                    .insert([{
                        user_1: userId,
                        user_2: targetUserId
                    }])
                    .select('id')
                    .single();
                if (insertError) {
                    console.error('❌ Error creating chat:', insertError);
                    res.status(500).json({
                        success: false,
                        message: 'Failed to create chat for invitation'
                    });
                    return;
                }
                finalChatId = newChat.id;
                console.log('✅ Created new chat:', finalChatId);
            }
        }
        else {
            console.log('✅ Using provided chat_id:', finalChatId);
        }
        console.log('🎯 Creating chess invitation...');
        const invitation = yield game_service_1.gameService.createChessInvitation({
            inviter_id: userId,
            invitee_id: targetUserId,
            chat_id: finalChatId,
            game_settings
        });
        console.log('✅ Chess invitation created:', invitation);
        const { data: inviterProfile } = yield app_1.supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', userId)
            .single();
        const inviterName = `${inviterProfile === null || inviterProfile === void 0 ? void 0 : inviterProfile.first_name} ${(inviterProfile === null || inviterProfile === void 0 ? void 0 : inviterProfile.last_name) || ''}`.trim();
        // Send real-time notification
        const targetEmail = targetProfile.email;
        console.log('📡 Sending real-time notification to:', targetEmail);
        if (targetEmail) {
            const targetSockets = sockets_1.connectedUsers.get(targetEmail);
            if (targetSockets) {
                console.log('📡 Found sockets for target user:', targetSockets.size);
                targetSockets.forEach(socketId => {
                    app_1.io.to(socketId).emit('chess_invitation_received', {
                        invitation,
                        inviter_name: inviterName,
                        inviter_id: userId,
                        message: message || `You've been invited to play chess!`,
                        room_link: `${process.env.CLIENT_URL}/chess/room/${invitation.room_id}`
                    });
                });
            }
            else {
                console.log('⚠️ No active sockets found for target user');
            }
        }
        // Send chat message about the invitation
        // Only send message if no chat_id was provided (new chat created) or if custom message is provided
        const shouldSendMessage = !chat_id || message;
        if (shouldSendMessage) {
            console.log('💬 Sending chat message...');
            // Use the structured format like the working invitations
            const messageContent = message ||
                `Room ID: chess?\nroom=${invitation.room_id}\nClick to join the chess game`;
            const messageData = {
                chat_id: finalChatId,
                sender: userId,
                message: messageContent,
                has_media: false,
                media: null,
                message_type: 'chess_invitation',
                reply_to: null,
                status: 'sent',
                created_at: new Date().toISOString(),
                is_deleted: false,
                is_edited: false
            };
            const { data: insertedMessage, error: messageError } = yield app_1.supabase
                .from('chatmessages')
                .insert([messageData])
                .select()
                .single();
            if (messageError) {
                console.error('❌ Error sending chat message:', messageError);
            }
            else {
                console.log('✅ Chat message sent successfully');
                // Update chat timestamp
                yield app_1.supabase
                    .from('chats')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', finalChatId);
                // Send real-time message notification
                const targetEmail = targetProfile.email;
                if (targetEmail) {
                    const targetSockets = sockets_1.connectedUsers.get(targetEmail);
                    if (targetSockets) {
                        targetSockets.forEach(socketId => {
                            app_1.io.to(socketId).emit('receive_message', insertedMessage);
                        });
                    }
                }
            }
        }
        else {
            console.log('📝 No chat message sent (using existing friend chat)');
        }
        res.status(201).json({
            success: true,
            data: {
                room_id: invitation.room_id,
                chat_id: finalChatId,
                room_link: `${process.env.CLIENT_URL}/chess?room=${invitation.room_id}`,
                invitation_id: invitation.id,
                inviter_name: inviterName,
                invitee_name: `${targetProfile.first_name} ${targetProfile.last_name || ''}`.trim(),
                status: invitation.status,
                created_at: invitation.created_at,
                expires_at: invitation.expires_at,
                game_settings: invitation.game_settings
            },
            message: 'Chess invitation sent successfully'
        });
    }
    catch (error) {
        console.error('❌ Error sending chess invite:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send chess invitation',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.sendChessInvite = sendChessInvite;
const acceptChessInvite = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const { invitation_id } = req.params;
        const gameRoom = yield game_service_1.gameService.acceptChessInvitation(invitation_id, userId);
        const inviterEmail = yield (0, getUserFriends_1.getUserEmailFromId)(gameRoom.inviter_id);
        if (inviterEmail) {
            const inviterSockets = sockets_1.connectedUsers.get(inviterEmail);
            if (inviterSockets) {
                inviterSockets.forEach(socketId => {
                    app_1.io.to(socketId).emit('chess_invitation_accepted', {
                        invitation_id,
                        room_id: gameRoom.room_id,
                        accepted_by: userId
                    });
                });
            }
        }
        res.status(200).json({
            success: true,
            data: gameRoom,
            message: 'Chess invitation accepted successfully'
        });
    }
    catch (error) {
        console.error('Error accepting chess invite:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to accept chess invitation',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.acceptChessInvite = acceptChessInvite;
const createChessRoom = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const { time_control, difficulty } = req.body;
        const roomData = yield game_service_1.gameService.createChessRoom(userId, {
            time_control,
            difficulty
        });
        res.status(201).json({
            success: true,
            data: {
                room_id: roomData.room_id,
                room_link: `${process.env.CLIENT_URL}/chess/room/${roomData.room_id}`
            },
            message: 'Chess room created successfully'
        });
    }
    catch (error) {
        console.error('Error creating chess room:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create chess room',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.createChessRoom = createChessRoom;
const getChessGameRoom = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { room_id } = req.params;
        const gameRoom = yield game_service_1.gameService.getChessGameRoom(room_id);
        res.status(200).json({
            success: true,
            data: gameRoom
        });
    }
    catch (error) {
        console.error('Error getting chess game room:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get chess game room',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getChessGameRoom = getChessGameRoom;
const saveGameResult = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const { room_id } = req.params;
        const { winner, loser, reason, moves } = req.body;
        if (!winner || !loser || !reason) {
            res.status(400).json({
                success: false,
                message: 'Missing required fields: winner, loser, reason'
            });
            return;
        }
        yield game_service_1.gameService.saveGameResult(room_id, {
            winner,
            loser,
            reason,
            moves: moves || []
        });
        app_1.io.to(`chess_room_${room_id}`).emit('chess_game_end', {
            winner,
            loser,
            reason,
            ended_by: userId,
            timestamp: new Date().toISOString()
        });
        res.status(200).json({
            success: true,
            message: 'Game result saved successfully'
        });
    }
    catch (error) {
        console.error('Error saving game result:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save game result',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.saveGameResult = saveGameResult;
const fetchAllUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const filters = req.body;
        const result = yield game_service_1.gameService.getAllUsers(filters);
        res.json({
            success: true,
            data: result.users,
            pagination: result.pagination
        });
    }
    catch (error) {
        console.error('Error in fetchAllUsers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.fetchAllUsers = fetchAllUsers;
const getPlayerChessRanking = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const ranking = yield game_service_1.gameService.getPlayerChessRanking(userId);
        res.status(200).json({
            success: true,
            data: ranking
        });
    }
    catch (error) {
        console.error('Error getting player chess ranking:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get player ranking',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getPlayerChessRanking = getPlayerChessRanking;
const getChessLeaderboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { limit = 50 } = req.query;
        const leaderboard = yield game_service_1.gameService.getChessLeaderboard(Number(limit));
        res.status(200).json({
            success: true,
            data: leaderboard
        });
    }
    catch (error) {
        console.error('Error getting chess leaderboard:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get leaderboard',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getChessLeaderboard = getChessLeaderboard;
