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
exports.getUserIdFromEmail = exports.getUserEmailFromId = exports.getUserFriends = void 0;
exports.getChatParticipants = getChatParticipants;
exports.getUnseenMessagesCount = getUnseenMessagesCount;
exports.updateUnseenCountForUser = updateUnseenCountForUser;
exports.updateUnseenCountForChatParticipants = updateUnseenCountForChatParticipants;
const _1 = require(".");
const app_1 = require("../app");
const getUserFriends = (email) => __awaiter(void 0, void 0, void 0, function* () {
    const { data: userProfile, error: profileError } = yield app_1.supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();
    if (profileError || !(userProfile === null || userProfile === void 0 ? void 0 : userProfile.id))
        return [];
    const userId = userProfile.id;
    const { data: friendships, error: friendshipsError } = yield app_1.supabase
        .from('friendships')
        .select('sender_id, receiver_id')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .eq('status', 'accepted');
    if (friendshipsError || !friendships)
        return [];
    const friendIds = friendships.map(friendship => friendship.sender_id === userId
        ? friendship.receiver_id
        : friendship.sender_id);
    const uniqueFriendIds = [...new Set(friendIds)];
    if (uniqueFriendIds.length === 0)
        return [];
    const { data: friendProfiles, error: friendsError } = yield app_1.supabase
        .from('profiles')
        .select('email')
        .in('id', uniqueFriendIds);
    if (friendsError || !friendProfiles)
        return [];
    return friendProfiles
        .map(profile => profile.email)
        .filter((email) => !!email);
});
exports.getUserFriends = getUserFriends;
const getUserEmailFromId = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield app_1.supabase
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .single();
        if (error || !data) {
            console.error(`❌ Failed to fetch email for user ${userId}:`, error === null || error === void 0 ? void 0 : error.message);
            return null;
        }
        return data.email;
    }
    catch (err) {
        console.error(`❌ Error in getUserEmailFromId for ${userId}:`, err);
        return null;
    }
});
exports.getUserEmailFromId = getUserEmailFromId;
const getUserIdFromEmail = (userEmail) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield app_1.supabase
            .from('profiles')
            .select('id')
            .eq('email', userEmail)
            .single();
        if (error || !data) {
            console.error(`❌ Failed to fetch email for user ${userEmail}:`, error === null || error === void 0 ? void 0 : error.message);
            return null;
        }
        return data.id;
    }
    catch (err) {
        console.error(`❌ Error in getUserEmailFromId for ${userEmail}:`, err);
        return null;
    }
});
exports.getUserIdFromEmail = getUserIdFromEmail;
function getChatParticipants(chatId) {
    return __awaiter(this, void 0, void 0, function* () {
        const { data: chat } = yield app_1.supabase
            .from('chats')
            .select('user_1, user_2')
            .eq('id', chatId)
            .single();
        if (!chat) {
            return [];
        }
        return [chat.user_1, chat.user_2];
    });
}
function getUnseenMessagesCount(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data: userChats, error: chatsError } = yield app_1.supabase
                .from('chats')
                .select('id')
                .or(`user_1.eq.${userId},user_2.eq.${userId}`);
            if (chatsError) {
                console.error('Error fetching user chats:', chatsError);
                throw chatsError;
            }
            if (!userChats || userChats.length === 0) {
                console.log('No chats found for user');
                return 0;
            }
            const chatIds = userChats.map(chat => chat.id);
            const { count, error } = yield app_1.supabase
                .from('chatmessages')
                .select('*', {
                count: 'exact',
                head: true
            })
                .in('chat_id', chatIds)
                .neq('sender', userId)
                .neq('status', 'seen');
            if (error) {
                console.error('Error counting unseen messages:', error);
                throw error;
            }
            return count || 0;
        }
        catch (error) {
            console.error('Unseen count error:', error);
            throw error;
        }
    });
}
function updateUnseenCountForUser(userEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = yield (0, exports.getUserIdFromEmail)(userEmail);
            if (userId) {
                const unseenCount = yield getUnseenMessagesCount(userId);
                if (_1.connectedUsers.has(userEmail)) {
                    _1.connectedUsers.get(userEmail).forEach(socketId => {
                        app_1.io.to(socketId).emit('unseen_count_update', { count: unseenCount });
                    });
                }
            }
        }
        catch (error) {
            console.error('Update unseen count for user error:', error);
        }
    });
}
function updateUnseenCountForChatParticipants(chatId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data: chat } = yield app_1.supabase
                .from('chats')
                .select('user_1, user_2')
                .eq('id', chatId)
                .single();
            if (chat) {
                const [user1Email, user2Email] = yield Promise.all([
                    (0, exports.getUserEmailFromId)(chat.user_1),
                    (0, exports.getUserEmailFromId)(chat.user_2)
                ]);
                // Update count for both users
                if (user1Email)
                    yield updateUnseenCountForUser(user1Email);
                if (user2Email)
                    yield updateUnseenCountForUser(user2Email);
            }
        }
        catch (error) {
            console.error('Update unseen count for chat participants error:', error);
        }
    });
}
