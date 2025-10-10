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
exports.getChamberMessages = exports.getTravelMessages = exports.getPublicMessages = exports.getDirectMessages = exports.getChamberMembers = exports.getUserChambers = exports.getAllChambers = exports.deleteChamber = exports.updateChamber = exports.joinChamberByInvite = exports.createChamber = exports.getUserConversations = exports.getUserFriends = void 0;
const app_1 = require("../app");
// ----------------------- friends ----------------------
// user frineds
const getUserFriends = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    try {
        const { data: friendships, error } = yield app_1.supabase
            .from('friendships')
            .select('id, sender_id, receiver_id, status')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .eq('status', 'accepted');
        if (error)
            return res.status(500).json({ success: false, error: error.message });
        const friendIds = friendships.map((entry) => entry.sender_id === userId ? entry.receiver_id : entry.sender_id);
        if (friendIds.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }
        const friendsWithChats = [];
        for (const friendId of friendIds) {
            const { data: existingChat, error: chatCheckError } = yield app_1.supabase
                .from('chats')
                .select('id')
                .or(`and(user_1.eq.${userId},user_2.eq.${friendId}),and(user_1.eq.${friendId},user_2.eq.${userId})`)
                .maybeSingle();
            let chatId = existingChat === null || existingChat === void 0 ? void 0 : existingChat.id;
            if (!existingChat && !chatCheckError) {
                const { data: newChat, error: insertError } = yield app_1.supabase
                    .from('chats')
                    .insert([
                    {
                        user_1: userId,
                        user_2: friendId
                    }
                ])
                    .select('id')
                    .single();
                if (insertError) {
                    console.error('Error creating chat:', insertError);
                    continue;
                }
                chatId = newChat.id;
            }
            if (chatId) {
                friendsWithChats.push({ friendId, chatId });
            }
        }
        const { data: friendsData, error: profileError } = yield app_1.supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, email')
            .in('id', friendIds);
        if (profileError) {
            return res.status(500).json({ success: false, error: profileError.message });
        }
        const formatted = friendsData.map(profile => {
            const chatInfo = friendsWithChats.find(f => f.friendId === profile.id);
            return {
                id: profile.id,
                user_name: `${profile.first_name} ${profile.last_name}`,
                avatar_img: profile.avatar_url,
                email: profile.email,
                chat_id: (chatInfo === null || chatInfo === void 0 ? void 0 : chatInfo.chatId) || null
            };
        });
        return res.status(200).json({ success: true, data: formatted });
    }
    catch (err) {
        console.error('Error in getUserFriends:', err);
        return res.status(500).json({ success: false, error: 'Something went wrong.' });
    }
});
exports.getUserFriends = getUserFriends;
// ----------------------- chambers & chats ----------------------
// get conversion
const getUserConversations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    try {
        const { data: friendships, error: friendshipsError } = yield app_1.supabase
            .from('friendships')
            .select('sender_id, receiver_id')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .eq('status', 'accepted');
        if (friendshipsError)
            throw friendshipsError;
        const friendIds = (friendships === null || friendships === void 0 ? void 0 : friendships.map(friendship => friendship.sender_id === userId ? friendship.receiver_id : friendship.sender_id)) || [];
        if (friendIds.length === 0) {
            return res.json({ success: true, data: [] });
        }
        const { data: chats, error: chatsError } = yield app_1.supabase
            .from('chats')
            .select('id, user_1, user_2, created_at, updated_at')
            .or(`and(user_1.eq.${userId},user_2.in.(${friendIds.join(',')})),and(user_2.eq.${userId},user_1.in.(${friendIds.join(',')}))`)
            .order('updated_at', { ascending: false });
        if (chatsError)
            throw chatsError;
        if (!chats || chats.length === 0) {
            return res.json({ success: true, data: [] });
        }
        const chatIds = chats.map(chat => chat.id);
        // Fetch all messages for these chats
        const { data: messages, error: messagesError } = yield app_1.supabase
            .from('chatmessages')
            .select('id, chat_id, sender, message, created_at, has_media, media, status')
            .in('chat_id', chatIds)
            .order('created_at', { ascending: false });
        if (messagesError)
            throw messagesError;
        const chatsWithMessages = chats.filter(chat => messages === null || messages === void 0 ? void 0 : messages.some(msg => msg.chat_id === chat.id));
        if (chatsWithMessages.length === 0) {
            return res.json({ success: true, data: [] });
        }
        const unseenCountsMap = new Map();
        messages === null || messages === void 0 ? void 0 : messages.forEach(msg => {
            if (msg.status === 'delivered' && msg.sender !== userId) {
                unseenCountsMap.set(msg.chat_id, (unseenCountsMap.get(msg.chat_id) || 0) + 1);
            }
        });
        const recentMessageMap = new Map();
        messages === null || messages === void 0 ? void 0 : messages.forEach(msg => {
            if (!recentMessageMap.has(msg.chat_id) ||
                new Date(msg.created_at) > new Date(recentMessageMap.get(msg.chat_id).created_at)) {
                recentMessageMap.set(msg.chat_id, msg);
            }
        });
        const { data: profiles, error: profilesError } = yield app_1.supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .in('id', friendIds);
        if (profilesError)
            throw profilesError;
        const profileMap = new Map((profiles === null || profiles === void 0 ? void 0 : profiles.map(p => [p.id, p])) || []);
        const formatted = chatsWithMessages.map(chat => {
            const otherUserId = chat.user_1 === userId ? chat.user_2 : chat.user_1;
            const profile = profileMap.get(otherUserId);
            const lastMessage = recentMessageMap.get(chat.id);
            const unseenCount = unseenCountsMap.get(chat.id) || 0;
            return {
                chat_id: chat.id,
                updated_at: chat.updated_at,
                last_message: lastMessage ? {
                    id: lastMessage.id,
                    message: lastMessage.message,
                    has_media: lastMessage.has_media,
                    created_at: lastMessage.created_at,
                    sender: lastMessage.sender
                } : null,
                unseen_count: unseenCount, // Add unseen count here
                user: {
                    id: otherUserId,
                    user_name: profile
                        ? `${profile.first_name} ${profile.last_name}`
                        : 'Unknown User',
                    avatar_img: (profile === null || profile === void 0 ? void 0 : profile.avatar_url) || ''
                }
            };
        }).sort((a, b) => {
            var _a, _b;
            const aTime = ((_a = a.last_message) === null || _a === void 0 ? void 0 : _a.created_at) || a.updated_at;
            const bTime = ((_b = b.last_message) === null || _b === void 0 ? void 0 : _b.created_at) || b.updated_at;
            return new Date(bTime).getTime() - new Date(aTime).getTime();
        });
        return res.json({ success: true, data: formatted });
    }
    catch (error) {
        console.error('Error fetching conversations:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch conversations'
        });
    }
});
exports.getUserConversations = getUserConversations;
// create custom chamber
const createChamber = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, description = '', custom_url, category, color_theme = '#6366f1', rules = [], policies = '', monetization = { enabled: false }, logo = null, cover_img = null, tags = [], members = [], is_public = false } = req.body;
        const { id: userId } = req.user;
        if (!name || !userId) {
            return res.status(400).json({ error: 'Missing chamber name or userId' });
        }
        // Generate a unique invite code (8 character alphanumeric)
        const generateInviteCode = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < 8; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        };
        const invite_code = generateInviteCode();
        const { data: chamber, error: chamberError } = yield app_1.supabase
            .from('custom_chambers')
            .insert([
            {
                name,
                description,
                custom_url,
                category,
                color_theme,
                rules,
                policies,
                monetization,
                logo,
                cover_img,
                tags,
                is_public,
                is_active: true,
                creator_id: userId,
                member_count: members.length + 1,
                invite_code,
                chamber_img: logo
            },
        ])
            .select()
            .single();
        if (chamberError)
            throw chamberError;
        const chamberId = chamber.id;
        // Insert chamber members
        // Insert chamber members
        const memberInserts = [
            {
                chamber_id: chamberId,
                user_id: userId,
                joined_at: new Date().toISOString(),
                role: "admin"
            },
            ...members.map((member) => ({
                chamber_id: chamberId,
                user_id: member.value,
                joined_at: new Date().toISOString(),
                role: "member"
            })),
        ];
        const { error: membersError } = yield app_1.supabase.from('chamber_members').insert(memberInserts);
        if (membersError)
            throw membersError;
        const inviteLink = `${process.env.FRONTEND_URL || 'https://yourdomain.com'}/join/${invite_code}`;
        res.status(201).json({
            message: 'Chamber created successfully',
            chamber: Object.assign(Object.assign({}, chamber), { invite_link: inviteLink })
        });
    }
    catch (err) {
        console.error('Error creating chamber:', err);
        res.status(500).json({ error: 'Failed to create chamber' });
    }
});
exports.createChamber = createChamber;
// Join chamber by invite code
const joinChamberByInvite = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { invite_code } = req.params;
        const { id: userId } = req.user;
        // Find chamber by invite code
        const { data: chamber, error: chamberError } = yield app_1.supabase
            .from('custom_chambers')
            .select('id, is_public')
            .eq('invite_code', invite_code)
            .single();
        if (chamberError || !chamber) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }
        // Check if user is already a member
        const { data: existingMember } = yield app_1.supabase
            .from('chamber_members')
            .select('user_id')
            .eq('chamber_id', chamber.id)
            .eq('user_id', userId)
            .single();
        if (existingMember) {
            return res.status(400).json({ error: 'You are already a member of this chamber' });
        }
        // Add user to chamber
        const { error: joinError } = yield app_1.supabase
            .from('chamber_members')
            .insert({
            chamber_id: chamber.id,
            user_id: userId,
            joined_at: new Date().toISOString(),
            is_moderator: false,
        });
        if (joinError)
            throw joinError;
        // Increment member count
        yield app_1.supabase.rpc('increment_member_count', {
            chamber_id: chamber.id,
        });
        res.status(200).json({ message: 'Successfully joined chamber' });
    }
    catch (err) {
        console.error('Error joining chamber:', err);
        res.status(500).json({ error: 'Failed to join chamber' });
    }
});
exports.joinChamberByInvite = joinChamberByInvite;
const updateChamber = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { id: userId } = req.user;
        const chamberId = req.params.id;
        const { name, description = '', custom_url, category, color_theme = '#6366f1', rules = [], policies = '', monetization = { enabled: false }, logo = null, cover_img = null, is_public = false } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }
        if (!chamberId) {
            return res.status(400).json({ error: 'Missing chamberId' });
        }
        // Validate ownership
        const { data: existingChamber, error: fetchError } = yield app_1.supabase
            .from('custom_chambers')
            .select('creator_id')
            .eq('id', chamberId)
            .single();
        if (fetchError)
            throw fetchError;
        if (!existingChamber) {
            return res.status(404).json({ error: 'Chamber not found' });
        }
        if (existingChamber.creator_id !== userId) {
            return res.status(403).json({ error: 'Unauthorized to update this chamber' });
        }
        // Prepare update payload
        const updateData = {
            name,
            description,
            custom_url,
            category,
            color_theme,
            rules,
            policies,
            monetization,
            logo,
            cover_img,
            chamber_img: logo,
            is_public,
            updated_at: new Date().toISOString()
        };
        // Update chamber
        const { data: updatedChamber, error: updateError } = yield app_1.supabase
            .from('custom_chambers')
            .update(updateData)
            .eq('id', chamberId)
            .select(`
                *,
                creator:profiles!creator_id(
                    id,
                    first_name,
                    last_name,
                    avatar_url
                )
            `);
        if (updateError)
            throw updateError;
        const chamber = updatedChamber[0];
        const formattedChamber = {
            id: chamber.id,
            chat_id: chamber.id,
            chamber_id: chamber.id,
            chamber_name: chamber.name,
            name: chamber.name,
            description: chamber.description,
            is_public: chamber.is_public,
            invite_code: chamber.invite_code,
            chamber_img: chamber.chamber_img || '',
            cover_img: chamber.cover_img || '',
            is_active: chamber.is_active,
            creator_id: chamber.creator_id,
            tags: chamber.tags || [],
            member_count: chamber.member_count || 0,
            created_at: chamber.created_at,
            updated_at: chamber.updated_at,
            creator: {
                id: chamber.creator_id,
                user_name: `${((_a = chamber.creator) === null || _a === void 0 ? void 0 : _a.first_name) || ''} ${((_b = chamber.creator) === null || _b === void 0 ? void 0 : _b.last_name) || ''}`.trim() || 'Creator Name',
                avatar_url: ((_c = chamber.creator) === null || _c === void 0 ? void 0 : _c.avatar_url) || '',
            }
        };
        res.status(200).json({
            success: true,
            data: formattedChamber
        });
    }
    catch (err) {
        console.error('Error updating chamber:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update chamber'
        });
    }
});
exports.updateChamber = updateChamber;
const deleteChamber = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id: userId } = req.user;
        const { chamberId } = req.params;
        if (!userId) {
            return res.status(400).json({ error: "Missing userId" });
        }
        if (!chamberId) {
            return res.status(400).json({ error: "Missing chamberId" });
        }
        const { data: chamber, error: chamberError } = yield app_1.supabase
            .from("custom_chambers")
            .select("id, creator_id")
            .eq("id", chamberId)
            .single();
        if (chamberError)
            throw chamberError;
        if (!chamber) {
            return res.status(404).json({ error: "Chamber not found" });
        }
        if (chamber.creator_id !== userId) {
            return res
                .status(403)
                .json({ error: "Unauthorized: only creator can delete chamber" });
        }
        yield app_1.supabase.from("chamber_members").delete().eq("chamber_id", chamberId);
        const { error: deleteError } = yield app_1.supabase
            .from("custom_chambers")
            .delete()
            .eq("id", chamberId);
        if (deleteError)
            throw deleteError;
        res.status(200).json({ success: true, message: "Chamber deleted successfully" });
    }
    catch (err) {
        console.error("Error deleting chamber:", err);
        res.status(500).json({ error: "Failed to delete chamber" });
    }
});
exports.deleteChamber = deleteChamber;
// get all chambers
const getAllChambers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const offset = (page - 1) * limit;
        const { count: totalChambers } = yield app_1.supabase
            .from('custom_chambers')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);
        const { data: chamberslist, error: chambersError } = yield app_1.supabase
            .from('custom_chambers')
            .select(`
                *,
                creator:profiles!creator_id(
                    id,
                    first_name,
                    last_name,
                    avatar_url,
                    username
                )
            `)
            .eq('is_active', true)
            .range(offset, offset + limit - 1)
            .order('updated_at', { ascending: false });
        if (chambersError)
            throw chambersError;
        const chamberIds = chamberslist.map((c) => c.id);
        let membersByChamber = {};
        if (chamberIds.length > 0) {
            const { data: membersList, error: membersError } = yield app_1.supabase
                .from('chamber_members')
                .select(`
                    *,
                    profile:profiles!user_id(
                        id,
                        first_name,
                        last_name,
                        username,
                        email,
                        avatar_url,
                        is_active
                    )
                `)
                .in('chamber_id', chamberIds);
            if (membersError)
                throw membersError;
            membersByChamber = membersList.reduce((acc, member) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j;
                if (!acc[member.chamber_id])
                    acc[member.chamber_id] = [];
                // Map all chamber_members columns to the response
                acc[member.chamber_id].push({
                    id: member.id,
                    chamber_id: member.chamber_id,
                    user_id: member.user_id,
                    joined_at: member.joined_at,
                    is_moderator: member.is_moderator,
                    role: member.role,
                    is_banned: member.is_banned,
                    banned_until: member.banned_until,
                    ban_reason: member.ban_reason,
                    is_flagged: member.is_flagged,
                    flagged_count: member.flagged_count,
                    last_flagged_at: member.last_flagged_at,
                    is_paid: member.is_paid,
                    payment_type: member.payment_type,
                    last_payment_at: member.last_payment_at,
                    next_payment_due: member.next_payment_due,
                    payment_status: member.payment_status,
                    // Profile information
                    email: (_a = member.profile) === null || _a === void 0 ? void 0 : _a.email,
                    first_name: (_b = member.profile) === null || _b === void 0 ? void 0 : _b.first_name,
                    username: (_c = member.profile) === null || _c === void 0 ? void 0 : _c.username,
                    last_name: (_d = member.profile) === null || _d === void 0 ? void 0 : _d.last_name,
                    avatar_url: (_e = member.profile) === null || _e === void 0 ? void 0 : _e.avatar_url,
                    is_active: (_f = member.profile) === null || _f === void 0 ? void 0 : _f.is_active,
                    // Computed fields for convenience - using full_name instead of user_name
                    full_name: `${((_g = member.profile) === null || _g === void 0 ? void 0 : _g.first_name) || ''} ${((_h = member.profile) === null || _h === void 0 ? void 0 : _h.last_name) || ''}`.trim(),
                    is_creator: chamberIds.includes(member.chamber_id) &&
                        ((_j = chamberslist.find((c) => c.id === member.chamber_id)) === null || _j === void 0 ? void 0 : _j.creator_id) === member.user_id
                });
                return acc;
            }, {});
        }
        // Map to consistent format
        const allChambers = chamberslist.map((chamber) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            const inviteLink = `${process.env.FRONTEND_URL || 'https://yourdomain.com'}/join/${chamber.invite_code}`;
            return Object.assign(Object.assign({}, chamber), { chamber_id: chamber.id, invite_link: inviteLink, creator: {
                    id: chamber.creator_id,
                    full_name: `${((_a = chamber.creator) === null || _a === void 0 ? void 0 : _a.first_name) || ''} ${((_b = chamber.creator) === null || _b === void 0 ? void 0 : _b.last_name) || ''}`.trim() || 'Creator Name',
                    username: ((_c = chamber.creator) === null || _c === void 0 ? void 0 : _c.username) || '',
                    avatar_url: ((_d = chamber.creator) === null || _d === void 0 ? void 0 : _d.avatar_url) || '',
                    first_name: (_e = chamber.creator) === null || _e === void 0 ? void 0 : _e.first_name,
                    last_name: (_f = chamber.creator) === null || _f === void 0 ? void 0 : _f.last_name,
                    email: (_g = chamber.creator) === null || _g === void 0 ? void 0 : _g.email
                }, members: membersByChamber[chamber.id] || [], member_count: ((_h = membersByChamber[chamber.id]) === null || _h === void 0 ? void 0 : _h.length) || 0 });
        });
        const totalPages = Math.ceil((totalChambers || 0) / limit);
        res.status(200).json({
            success: true,
            data: allChambers,
            pagination: {
                total: totalChambers || 0,
                page: page,
                pages: totalPages,
                hasMore: page < totalPages
            }
        });
    }
    catch (err) {
        console.error('Error fetching user chambers:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chambers'
        });
    }
});
exports.getAllChambers = getAllChambers;
// get user chambers
const getUserChambers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }
        // First, fetch owned chambers with last message
        const { data: ownedChambers, error: ownedError } = yield app_1.supabase
            .from('custom_chambers')
            .select(`
                *,
                creator:profiles!creator_id(
                    id,
                    first_name,
                    last_name,
                    avatar_url,
                    username
                ),
                last_message:chamber_messages(
                    id,
                    message,
                    created_at,
                    sender_id
                )
            `)
            .eq('creator_id', userId)
            .eq('is_active', true)
            .order('created_at', { foreignTable: 'last_message', ascending: false })
            .limit(1, { foreignTable: 'last_message' });
        if (ownedError)
            throw ownedError;
        // Then fetch member chambers with last message and creator info
        const { data: memberChambers, error: memberError } = yield app_1.supabase
            .from('chamber_members')
            .select(`
                chamber_id, 
                chambers:custom_chambers(
                    *,
                    creator:profiles!creator_id(
                        id,
                        first_name,
                        last_name,
                        avatar_url,
                        username
                    ),
                    last_message:chamber_messages(
                        id,
                        message,
                        created_at,
                        sender_id
                    )
                )
            `)
            .eq('user_id', userId)
            .neq('custom_chambers.creator_id', userId)
            .eq('custom_chambers.is_active', true)
            .order('created_at', { foreignTable: 'chambers.last_message', ascending: false })
            .limit(1, { foreignTable: 'chambers.last_message' });
        if (memberError)
            throw memberError;
        const joinedChambers = memberChambers
            .map((item) => item.chambers)
            .filter((chamber) => !!chamber);
        // Combine all chambers
        const allChambers = [...ownedChambers, ...joinedChambers];
        const chamberIds = allChambers.map((c) => c.id);
        let membersByChamber = {};
        if (chamberIds.length > 0) {
            // Fetch complete chamber_members data for all chambers
            const { data: membersList, error: membersError } = yield app_1.supabase
                .from('chamber_members')
                .select(`
                    *,
                    profile:profiles!user_id(
                        id,
                        first_name,
                        last_name,
                        username,
                        email,
                        avatar_url,
                        is_active
                    )
                `)
                .in('chamber_id', chamberIds);
            if (membersError)
                throw membersError;
            membersByChamber = membersList.reduce((acc, member) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j;
                if (!acc[member.chamber_id])
                    acc[member.chamber_id] = [];
                acc[member.chamber_id].push({
                    id: member.id,
                    chamber_id: member.chamber_id,
                    user_id: member.user_id,
                    joined_at: member.joined_at,
                    is_moderator: member.is_moderator,
                    role: member.role,
                    is_banned: member.is_banned,
                    banned_until: member.banned_until,
                    ban_reason: member.ban_reason,
                    is_flagged: member.is_flagged,
                    flagged_count: member.flagged_count,
                    last_flagged_at: member.last_flagged_at,
                    is_paid: member.is_paid,
                    payment_type: member.payment_type,
                    last_payment_at: member.last_payment_at,
                    next_payment_due: member.next_payment_due,
                    payment_status: member.payment_status,
                    // Profile information
                    email: (_a = member.profile) === null || _a === void 0 ? void 0 : _a.email,
                    first_name: (_b = member.profile) === null || _b === void 0 ? void 0 : _b.first_name,
                    last_name: (_c = member.profile) === null || _c === void 0 ? void 0 : _c.last_name,
                    username: (_d = member.profile) === null || _d === void 0 ? void 0 : _d.username,
                    avatar_url: (_e = member.profile) === null || _e === void 0 ? void 0 : _e.avatar_url,
                    is_active: (_f = member.profile) === null || _f === void 0 ? void 0 : _f.is_active,
                    // Computed fields for convenience - using full_name instead of user_name
                    full_name: `${((_g = member.profile) === null || _g === void 0 ? void 0 : _g.first_name) || ''} ${((_h = member.profile) === null || _h === void 0 ? void 0 : _h.last_name) || ''}`.trim(),
                    is_creator: ((_j = allChambers.find((c) => c.id === member.chamber_id)) === null || _j === void 0 ? void 0 : _j.creator_id) === member.user_id
                });
                return acc;
            }, {});
        }
        // Format the final response
        const formattedChambers = allChambers.map((chamber) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            return ({
                id: chamber.id,
                chat_id: chamber.id,
                chamber_id: chamber.id,
                chamber_name: chamber.name,
                name: chamber.name,
                description: chamber.description,
                is_public: chamber.is_public,
                invite_code: chamber.invite_code,
                chamber_img: chamber.chamber_img || '',
                is_active: chamber.is_active,
                is_chamber: true,
                creator_id: chamber.creator_id,
                custom_url: chamber.custom_url,
                tags: chamber.tags || [],
                member_count: ((_a = membersByChamber[chamber.id]) === null || _a === void 0 ? void 0 : _a.length) || 0,
                updated_at: chamber.updated_at,
                last_message: ((_b = chamber.last_message) === null || _b === void 0 ? void 0 : _b[0]) ? {
                    id: chamber.last_message[0].id,
                    message: chamber.last_message[0].message,
                    created_at: chamber.last_message[0].created_at,
                    sender_id: chamber.last_message[0].sender_id
                } : null,
                creator: {
                    id: chamber.creator_id,
                    full_name: `${((_c = chamber.creator) === null || _c === void 0 ? void 0 : _c.first_name) || ''} ${((_d = chamber.creator) === null || _d === void 0 ? void 0 : _d.last_name) || ''}`.trim() || 'Creator Name',
                    username: ((_e = chamber.creator) === null || _e === void 0 ? void 0 : _e.username) || '',
                    avatar_url: ((_f = chamber.creator) === null || _f === void 0 ? void 0 : _f.avatar_url) || '',
                    first_name: (_g = chamber.creator) === null || _g === void 0 ? void 0 : _g.first_name,
                    last_name: (_h = chamber.creator) === null || _h === void 0 ? void 0 : _h.last_name
                },
                // Include complete members data
                members: membersByChamber[chamber.id] || []
            });
        });
        res.status(200).json({
            success: true,
            data: formattedChambers,
            pagination: {
                total: formattedChambers.length,
                page: 1,
                pages: 1,
                hasMore: false
            }
        });
    }
    catch (err) {
        console.error('Error fetching user chambers:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chambers'
        });
    }
});
exports.getUserChambers = getUserChambers;
// get chamber members
const getChamberMembers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const { chamber_id } = req.params;
        const { id: userId } = req.user;
        if (!chamber_id) {
            return res.status(400).json({ error: 'Missing chamber_id' });
        }
        const { data: chamber, error: chamberError } = yield app_1.supabase
            .from('custom_chambers')
            .select(`
                *,
                creator:profiles!creator_id(
                    id,
                    first_name,
                    last_name,
                    avatar_url,
                    email,
                    username
                )
            `)
            .eq('id', chamber_id)
            .single();
        if (chamberError || !chamber) {
            return res.status(404).json({ error: 'Chamber not found' });
        }
        if (!chamber.is_public) {
            const { data: membership, error: membershipError } = yield app_1.supabase
                .from('chamber_members')
                .select('user_id, is_moderator')
                .eq('chamber_id', chamber_id)
                .eq('user_id', userId)
                .single();
            if (membershipError || !membership) {
                return res.status(403).json({ error: 'Not authorized to view this chamber' });
            }
        }
        // Get all members with their profile data and all chamber_members columns
        const { data: members, error: membersError } = yield app_1.supabase
            .from('chamber_members')
            .select(`
                *,
                profiles:user_id (
                    id,
                    first_name,
                    last_name,
                    username,
                    avatar_url,
                    email,
                    is_active
                )
            `)
            .eq('chamber_id', chamber_id)
            .order('joined_at', { ascending: true });
        if (membersError)
            throw membersError;
        // Format the response to include all chamber_members data
        const formattedMembers = members.map((member) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            return ({
                // Chamber members table columns
                id: member.id,
                chamber_id: member.chamber_id,
                user_id: member.user_id,
                joined_at: member.joined_at,
                is_moderator: member.is_moderator,
                role: member.role,
                is_banned: member.is_banned,
                banned_until: member.banned_until,
                ban_reason: member.ban_reason,
                is_flagged: member.is_flagged,
                flagged_count: member.flagged_count,
                last_flagged_at: member.last_flagged_at,
                is_paid: member.is_paid,
                payment_type: member.payment_type,
                last_payment_at: member.last_payment_at,
                next_payment_due: member.next_payment_due,
                payment_status: member.payment_status,
                // Profile data
                first_name: (_a = member.profiles) === null || _a === void 0 ? void 0 : _a.first_name,
                last_name: (_b = member.profiles) === null || _b === void 0 ? void 0 : _b.last_name,
                username: (_c = member.profiles) === null || _c === void 0 ? void 0 : _c.username,
                full_name: `${((_d = member.profiles) === null || _d === void 0 ? void 0 : _d.first_name) || ''} ${((_e = member.profiles) === null || _e === void 0 ? void 0 : _e.last_name) || ''}`.trim(),
                avatar_url: (_f = member.profiles) === null || _f === void 0 ? void 0 : _f.avatar_url,
                email: (_g = member.profiles) === null || _g === void 0 ? void 0 : _g.email,
                is_active: (_h = member.profiles) === null || _h === void 0 ? void 0 : _h.is_active,
                // Additional computed fields
                is_creator: member.user_id === chamber.creator_id,
                online: false, // You might want to implement actual online status logic
            });
        });
        res.status(200).json({
            success: true,
            data: {
                members: formattedMembers,
                total: formattedMembers.length,
                is_public: chamber.is_public,
                creator: {
                    id: chamber.creator_id,
                    first_name: (_a = chamber.creator) === null || _a === void 0 ? void 0 : _a.first_name,
                    last_name: (_b = chamber.creator) === null || _b === void 0 ? void 0 : _b.last_name,
                    username: (_c = chamber.creator) === null || _c === void 0 ? void 0 : _c.username,
                    full_name: `${((_d = chamber.creator) === null || _d === void 0 ? void 0 : _d.first_name) || ''} ${((_e = chamber.creator) === null || _e === void 0 ? void 0 : _e.last_name) || ''}`.trim(),
                    avatar_url: (_f = chamber.creator) === null || _f === void 0 ? void 0 : _f.avatar_url,
                    email: (_g = chamber.creator) === null || _g === void 0 ? void 0 : _g.email,
                },
                chamber_info: {
                    id: chamber.id,
                    name: chamber.name,
                    description: chamber.description,
                    is_public: chamber.is_public,
                    created_at: chamber.created_at,
                    custom_url: chamber.custom_url
                }
            }
        });
    }
    catch (err) {
        console.error('Error fetching chamber members:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chamber members'
        });
    }
});
exports.getChamberMembers = getChamberMembers;
// ----------------------- messages ----------------------
// get direct messages
const getDirectMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    try {
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const offset = (pageNumber - 1) * limitNumber;
        const { data: chat, error: chatError } = yield app_1.supabase
            .from('chats')
            .select('user_1, user_2')
            .eq('id', chatId)
            .single();
        if (chatError || !chat) {
            return res.status(404).json({
                success: false,
                error: 'Chat not found or access denied'
            });
        }
        const { data: messages, error: messagesError, count } = yield app_1.supabase
            .from('chatmessages')
            .select('*', { count: 'exact' })
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limitNumber - 1);
        if (messagesError)
            throw messagesError;
        const messageIds = (messages === null || messages === void 0 ? void 0 : messages.map(msg => msg.id)) || [];
        let reactionsData = {};
        if (messageIds.length > 0) {
            const { data: reactions, error: reactionsError } = yield app_1.supabase
                .from('chat_reactions')
                .select('*')
                .in('target_id', messageIds);
            if (reactionsError)
                throw reactionsError;
            reactionsData = reactions === null || reactions === void 0 ? void 0 : reactions.reduce((acc, reaction) => {
                if (!acc[reaction.target_id]) {
                    acc[reaction.target_id] = [];
                }
                acc[reaction.target_id].push(reaction);
                return acc;
            }, {});
        }
        const messagesWithReactions = messages === null || messages === void 0 ? void 0 : messages.map(message => {
            const messageReactions = reactionsData[message.id] || [];
            const reactions = messageReactions.reduce((acc, reaction) => {
                if (!acc[reaction.type]) {
                    acc[reaction.type] = [];
                }
                acc[reaction.type].push(reaction.user_id);
                return acc;
            }, {});
            return Object.assign(Object.assign({}, message), { reactions: Object.keys(reactions).length > 0 ? reactions : undefined });
        });
        const totalItems = count || 0;
        const hasMore = totalItems > pageNumber * limitNumber;
        return res.status(200).json({
            success: true,
            data: messagesWithReactions || [],
            pagination: {
                currentPage: pageNumber,
                limit: limitNumber,
                totalItems,
                totalPages: Math.ceil(totalItems / limitNumber),
                hasMore
            }
        });
    }
    catch (error) {
        console.error('Error fetching messages:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch messages'
        });
    }
});
exports.getDirectMessages = getDirectMessages;
// Get all public messages (with pagination)
const getPublicMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { page = 1, limit = 50 } = req.query;
    try {
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const offset = (pageNumber - 1) * limitNumber;
        const { data: messages, error: messagesError, count } = yield app_1.supabase
            .from('public_chat')
            .select(`
                id,
                message,
                reply_to,
                is_edited,
                is_deleted,
                created_at,
                updated_at,
                sender:profiles(id, first_name, last_name, avatar_url)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limitNumber - 1);
        if (messagesError)
            throw messagesError;
        const messageIds = (messages === null || messages === void 0 ? void 0 : messages.map(msg => msg.id)) || [];
        let reactionsData = {};
        if (messageIds.length > 0) {
            const { data: reactions, error: reactionsError } = yield app_1.supabase
                .from('chat_reactions')
                .select('*')
                .in('target_id', messageIds)
                .eq('target_type', 'public_chat_message');
            if (reactionsError)
                throw reactionsError;
            reactionsData = reactions === null || reactions === void 0 ? void 0 : reactions.reduce((acc, reaction) => {
                if (!acc[reaction.target_id]) {
                    acc[reaction.target_id] = [];
                }
                acc[reaction.target_id].push(reaction);
                return acc;
            }, {});
        }
        const messagesWithReactions = messages === null || messages === void 0 ? void 0 : messages.map(message => {
            const messageReactions = reactionsData[message.id] || [];
            const reactions = messageReactions.reduce((acc, reaction) => {
                if (!acc[reaction.type]) {
                    acc[reaction.type] = [];
                }
                acc[reaction.type].push(reaction.user_id);
                return acc;
            }, {});
            return Object.assign(Object.assign({}, message), { reactions: reactions });
        });
        const totalItems = count || 0;
        const hasMore = totalItems > pageNumber * limitNumber;
        return res.status(200).json({
            success: true,
            data: messagesWithReactions || [],
            pagination: {
                currentPage: pageNumber,
                limit: limitNumber,
                totalItems,
                totalPages: Math.ceil(totalItems / limitNumber),
                hasMore
            }
        });
    }
    catch (error) {
        console.error('Error fetching public messages:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch messages'
        });
    }
});
exports.getPublicMessages = getPublicMessages;
const getTravelMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { page = 1, limit = 50 } = req.query;
    try {
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const offset = (pageNumber - 1) * limitNumber;
        const { data: messages, error: messagesError, count } = yield app_1.supabase
            .from('travel_chat')
            .select(`
                id,
                message,
                reply_to,
                is_edited,
                is_deleted,
                created_at,
                updated_at,
                sender:profiles(id, first_name, last_name, avatar_url)
            `, { count: 'exact' })
            .order('created_at', { ascending: true })
            .range(offset, offset + limitNumber - 1);
        if (messagesError)
            throw messagesError;
        const messageIds = (messages === null || messages === void 0 ? void 0 : messages.map(msg => msg.id)) || [];
        let reactionsData = {};
        if (messageIds.length > 0) {
            const { data: reactions, error: reactionsError } = yield app_1.supabase
                .from('chat_reactions')
                .select('*')
                .in('target_id', messageIds)
                .eq('target_type', 'travel_chat_message');
            if (reactionsError)
                throw reactionsError;
            reactionsData = reactions.reduce((acc, reaction) => {
                if (!acc[reaction.target_id]) {
                    acc[reaction.target_id] = [];
                }
                acc[reaction.target_id].push(reaction);
                return acc;
            }, {});
        }
        const messagesWithReactions = messages.map(message => {
            const messageReactions = reactionsData[message.id] || [];
            const reactions = messageReactions.reduce((acc, reaction) => {
                if (!acc[reaction.type]) {
                    acc[reaction.type] = [];
                }
                acc[reaction.type].push(reaction.user_id);
                return acc;
            }, {});
            return Object.assign(Object.assign({}, message), { reactions });
        });
        const totalItems = count || 0;
        const hasMore = totalItems > pageNumber * limitNumber;
        return res.json({
            success: true,
            data: messagesWithReactions,
            pagination: {
                currentPage: pageNumber,
                limit: limitNumber,
                totalItems,
                totalPages: Math.ceil(totalItems / limitNumber),
                hasMore
            }
        });
    }
    catch (error) {
        console.error('Error fetching travel messages:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch messages'
        });
    }
});
exports.getTravelMessages = getTravelMessages;
const getChamberMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { chamber_id } = req.params;
        const { id: userId } = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        if (!chamber_id) {
            res.status(400).json({ success: false, error: 'Missing chamber_id' });
            return;
        }
        // Verify chamber exists
        const { data: chamber, error: chamberError } = yield app_1.supabase
            .from('custom_chambers')
            .select('is_public')
            .eq('id', chamber_id)
            .single();
        if (chamberError || !chamber) {
            res.status(404).json({ success: false, error: 'Chamber not found' });
            return;
        }
        if (!chamber.is_public) {
            const { data: membership, error: membershipError } = yield app_1.supabase
                .from('chamber_members')
                .select('user_id')
                .eq('chamber_id', chamber_id)
                .eq('user_id', userId)
                .single();
            if (membershipError || !membership) {
                res.status(403).json({ success: false, error: 'Not authorized to view this chamber' });
                return;
            }
        }
        const { data: messages, error: messagesError, count } = yield app_1.supabase
            .from('chamber_messages')
            .select(`
                id,
                chamber_id,
                sender_id,
                message,
                has_media,
                media,
                message_type,
                reply_to,
                is_edited,
                is_deleted,
                created_at,
                updated_at,
                deleted_at,
                profiles: sender_id (id, first_name, last_name, avatar_url),
                replied_message: reply_to (id, message, sender_id, profiles: sender_id (id, first_name, last_name, avatar_url))
            `, { count: 'exact' })
            .eq('chamber_id', chamber_id)
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);
        if (messagesError)
            throw messagesError;
        const messageIds = (messages === null || messages === void 0 ? void 0 : messages.map(msg => msg.id)) || [];
        let reactionsData = {};
        if (messageIds.length > 0) {
            const { data: reactions, error: reactionsError } = yield app_1.supabase
                .from('chat_reactions')
                .select('*')
                .in('target_id', messageIds)
                .eq('target_type', 'chamber_message');
            if (reactionsError)
                throw reactionsError;
            reactionsData = reactions.reduce((acc, reaction) => {
                if (!acc[reaction.target_id]) {
                    acc[reaction.target_id] = [];
                }
                acc[reaction.target_id].push(reaction);
                return acc;
            }, {});
        }
        const formattedMessages = messages.map((message) => {
            const media = message.has_media
                ? Array.isArray(message.media)
                    ? message.media.filter((item) => item !== null)
                    : message.media
                        ? [message.media]
                        : null
                : null;
            const messageReactions = reactionsData[message.id] || [];
            const reactions = messageReactions.reduce((acc, reaction) => {
                if (!acc[reaction.type]) {
                    acc[reaction.type] = [];
                }
                acc[reaction.type].push(reaction.user_id);
                return acc;
            }, {});
            return {
                id: message.id,
                chamber_id: message.chamber_id,
                sender_id: message.sender_id,
                message: message.message,
                has_media: message.has_media,
                media,
                message_type: message.message_type || 'text',
                reply_to: message.reply_to,
                is_edited: message.is_edited,
                is_deleted: message.is_deleted,
                created_at: message.created_at,
                updated_at: message.updated_at,
                deleted_at: message.deleted_at,
                sender: {
                    id: message.sender_id,
                    first_name: message.profiles.first_name,
                    last_name: message.profiles.last_name,
                    user_name: `${message.profiles.first_name} ${message.profiles.last_name}`.trim(),
                    avatar_img: message.profiles.avatar_url
                },
                replied_message: message.reply_to ? {
                    id: message.replied_message.id,
                    message: message.replied_message.message,
                    sender_id: message.replied_message.sender_id,
                    sender: {
                        id: message.replied_message.sender_id,
                        first_name: message.replied_message.profiles.first_name,
                        last_name: message.replied_message.profiles.last_name,
                        user_name: `${message.replied_message.profiles.first_name} ${message.replied_message.profiles.last_name}`.trim(),
                        avatar_img: message.replied_message.profiles.avatar_url
                    }
                } : null,
                reactions
            };
        });
        const totalPages = Math.ceil((count || 0) / limit);
        res.status(200).json({
            success: true,
            data: formattedMessages.reverse(),
            pagination: {
                total: count || 0,
                page,
                pages: totalPages,
                hasMore: page < totalPages
            }
        });
    }
    catch (err) {
        console.error('Error fetching chamber messages:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chamber messages'
        });
    }
});
exports.getChamberMessages = getChamberMessages;
