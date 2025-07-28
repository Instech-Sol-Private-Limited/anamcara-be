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
exports.rejectFriendRequest = exports.acceptFriendRequest = exports.sendFriendRequest = void 0;
const app_1 = require("../app");
const emitNotification_1 = require("../sockets/emitNotification");
// Send friend request
const sendFriendRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { senderId, receiverId } = req.body;
        // Check if friendship already exists
        const { data: existingFriendship } = yield app_1.supabase
            .from('friendships')
            .select('*')
            .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},sender_id.eq.${senderId})`)
            .single();
        if (existingFriendship) {
            if (existingFriendship.status === 'rejected') {
                // Update status to pending and update timestamps
                const { data: updatedFriendship, error: updateError } = yield app_1.supabase
                    .from('friendships')
                    .update({ status: 'pending', updated_at: new Date().toISOString() })
                    .eq('id', existingFriendship.id)
                    .select()
                    .single();
                if (updateError) {
                    res.status(400).json({
                        success: false,
                        message: updateError.message
                    });
                    return;
                }
                // Get sender and receiver info
                const { data: senderProfile } = yield app_1.supabase
                    .from('profiles')
                    .select('first_name, last_name, email')
                    .eq('id', senderId)
                    .single();
                const { data: receiverProfile } = yield app_1.supabase
                    .from('profiles')
                    .select('email')
                    .eq('id', receiverId)
                    .single();
                if (!senderProfile || !receiverProfile) {
                    res.status(404).json({
                        success: false,
                        message: 'User not found'
                    });
                    return;
                }
                // Send notification to receiver
                const senderName = `${senderProfile.first_name} ${senderProfile.last_name || ''}`.trim();
                yield (0, emitNotification_1.sendNotification)({
                    recipientEmail: receiverProfile.email,
                    recipientUserId: receiverId,
                    actorUserId: senderId,
                    threadId: null,
                    message: `**${senderName}** sent you a _friend request_`,
                    type: 'friend_request_received',
                    metadata: {
                        friendship_id: updatedFriendship.id,
                        sender_name: senderName,
                        sender_id: senderId
                    }
                });
                res.json({
                    success: true,
                    data: updatedFriendship,
                    message: 'Friend request sent successfully'
                });
                return;
            }
            else {
                res.status(400).json({
                    success: false,
                    message: 'Friend request already exists or you are already friends'
                });
                return;
            }
        }
        // If no existing friendship, create a new one
        const { data: senderProfile } = yield app_1.supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', senderId)
            .single();
        const { data: receiverProfile } = yield app_1.supabase
            .from('profiles')
            .select('email')
            .eq('id', receiverId)
            .single();
        if (!senderProfile || !receiverProfile) {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
            return;
        }
        // Create friendship record
        const { data: friendship, error } = yield app_1.supabase
            .from('friendships')
            .insert([{
                sender_id: senderId,
                receiver_id: receiverId,
                status: 'pending'
            }])
            .select()
            .single();
        if (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
            return;
        }
        // Send notification to receiver
        const senderName = `${senderProfile.first_name} ${senderProfile.last_name || ''}`.trim();
        yield (0, emitNotification_1.sendNotification)({
            recipientEmail: receiverProfile.email,
            recipientUserId: receiverId,
            actorUserId: senderId,
            threadId: null,
            message: `**${senderName}** sent you a _friend request_`,
            type: 'friend_request_received',
            metadata: {
                friendship_id: friendship.id,
                sender_name: senderName,
                sender_id: senderId
            }
        });
        res.json({
            success: true,
            data: friendship,
            message: 'Friend request sent successfully'
        });
        return;
    }
    catch (error) {
        console.error('Error sending friend request:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
        return;
    }
});
exports.sendFriendRequest = sendFriendRequest;
// Accept friend request
const acceptFriendRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { friendshipId, userId } = req.body;
        // Get friendship details
        const { data: friendship } = yield app_1.supabase
            .from('friendships')
            .select(`
        *,
        sender:profiles!friendships_sender_id_fkey(first_name, last_name, email),
        receiver:profiles!friendships_receiver_id_fkey(first_name, last_name, email)
      `)
            .eq('id', friendshipId)
            .single();
        if (!friendship) {
            res.status(404).json({
                success: false,
                message: 'Friend request not found'
            });
            return;
        }
        // Update friendship status
        const { data: updatedFriendship, error } = yield app_1.supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', friendshipId)
            .select()
            .single();
        if (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
            return;
        }
        // Send notification to sender
        const accepterName = friendship.receiver_id === userId
            ? `${friendship.receiver.first_name} ${friendship.receiver.last_name || ''}`.trim()
            : `${friendship.sender.first_name} ${friendship.sender.last_name || ''}`.trim();
        const senderEmail = friendship.sender.email;
        yield (0, emitNotification_1.sendNotification)({
            recipientEmail: senderEmail,
            recipientUserId: friendship.sender_id,
            actorUserId: userId,
            threadId: '', // Not used for friendships
            message: `**${accepterName}** accepted your _friend request_`,
            type: 'friend_request_accepted',
            metadata: {
                friendship_id: friendshipId,
                accepter_name: accepterName,
                accepter_id: userId
            }
        });
        res.json({
            success: true,
            data: updatedFriendship,
            message: 'Friend request accepted'
        });
        return;
    }
    catch (error) {
        console.error('Error accepting friend request:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
        return;
    }
});
exports.acceptFriendRequest = acceptFriendRequest;
// Reject friend request
const rejectFriendRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { friendshipId } = req.body;
        const { data, error } = yield app_1.supabase
            .from('friendships')
            .update({ status: 'rejected' })
            .eq('id', friendshipId)
            .select()
            .single();
        if (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
            return;
        }
        res.json({
            success: true,
            data,
            message: 'Friend request rejected'
        });
        return;
    }
    catch (error) {
        console.error('Error rejecting friend request:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
        return;
    }
});
exports.rejectFriendRequest = rejectFriendRequest;
