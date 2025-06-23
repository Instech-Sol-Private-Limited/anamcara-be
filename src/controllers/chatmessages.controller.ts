import { Request, Response } from 'express';
import { supabase } from '../app';


// ----------------------- friends ----------------------
// user frineds
export const getUserFriends = async (req: Request, res: Response): Promise<any> => {
    const { userId } = req.params;

    try {
        const { data: friendships, error } = await supabase
            .from('friendships')
            .select('id, sender_id, receiver_id, status')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .eq('status', 'accepted');

        if (error) return res.status(500).json({ success: false, error: error.message });

        const friendIds = friendships.map((entry) =>
            entry.sender_id === userId ? entry.receiver_id : entry.sender_id
        );

        if (friendIds.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const friendsWithChats: {
            friendId: string;
            chatId: string;
        }[] = [];

        for (const friendId of friendIds) {
            const { data: existingChat, error: chatCheckError } = await supabase
                .from('chats')
                .select('id')
                .or(`and(user_1.eq.${userId},user_2.eq.${friendId}),and(user_1.eq.${friendId},user_2.eq.${userId})`)
                .maybeSingle();

            let chatId = existingChat?.id;

            if (!existingChat && !chatCheckError) {
                const { data: newChat, error: insertError } = await supabase
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

        const { data: friendsData, error: profileError } = await supabase
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
                chat_id: chatInfo?.chatId || null
            };
        });

        return res.status(200).json({ success: true, data: formatted });

    } catch (err) {
        console.error('Error in getUserFriends:', err);
        return res.status(500).json({ success: false, error: 'Something went wrong.' });
    }
};


// ----------------------- chambers & chats ----------------------
// get conversion
export const getUserConversations = async (req: Request, res: Response): Promise<any> => {
    const { userId } = req.params;

    try {
        const { data: friendships, error: friendshipsError } = await supabase
            .from('friendships')
            .select('sender_id, receiver_id')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .eq('status', 'accepted');

        if (friendshipsError) throw friendshipsError;

        const friendIds = friendships?.map(friendship =>
            friendship.sender_id === userId ? friendship.receiver_id : friendship.sender_id
        ) || [];

        if (friendIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const { data: chats, error: chatsError } = await supabase
            .from('chats')
            .select('id, user_1, user_2, created_at, updated_at')
            .or(`and(user_1.eq.${userId},user_2.in.(${friendIds.join(',')})),and(user_2.eq.${userId},user_1.in.(${friendIds.join(',')}))`);

        if (chatsError) throw chatsError;
        if (!chats || chats.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const chatIds = chats.map(chat => chat.id);
        const { data: messages, error: messagesError } = await supabase
            .from('chatmessages')
            .select('id, chat_id, sender, message, created_at, has_media, media')
            .in('chat_id', chatIds);

        if (messagesError) throw messagesError;

        const chatsWithMessages = chats.filter(chat =>
            messages?.some(msg => msg.chat_id === chat.id)
        );

        if (chatsWithMessages.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const recentMessageMap = new Map<string, any>();
        messages?.forEach(msg => {
            if (!recentMessageMap.has(msg.chat_id) ||
                new Date(msg.created_at) > new Date(recentMessageMap.get(msg.chat_id).created_at)) {
                recentMessageMap.set(msg.chat_id, msg);
            }
        });

        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .in('id', friendIds);

        if (profilesError) throw profilesError;

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const formatted = chatsWithMessages.map(chat => {
            const otherUserId = chat.user_1 === userId ? chat.user_2 : chat.user_1;
            const profile = profileMap.get(otherUserId);
            const lastMessage = recentMessageMap.get(chat.id);

            return {
                chat_id: chat.id,
                updated_at: chat.updated_at,
                last_message: lastMessage ? {
                    id: lastMessage.id,
                    message: lastMessage.message,
                    has_media: lastMessage.has_media,
                    created_at: lastMessage.created_at
                } : null,
                user: {
                    id: otherUserId,
                    user_name: profile
                        ? `${profile.first_name} ${profile.last_name}`
                        : 'Unknown User',
                    avatar_img: profile?.avatar_url || ''
                }
            };
        }).sort((a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

        return res.json({ success: true, data: formatted });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch conversations'
        });
    }
};

// create custom chamber
export const createChamber = async (req: Request, res: Response): Promise<any> => {
    try {
        const { name, description = '', tags = [], members = [], is_public = false } = req.body;
        const { id: userId } = req.user!;

        if (!name || !userId) {
            return res.status(400).json({ error: 'Missing chamber name or userId' });
        }

        const { data: chamber, error: chamberError } = await supabase
            .from('custom_chambers')
            .insert([
                {
                    name,
                    description,
                    tags,
                    is_public,
                    is_active: true,
                    creator_id: userId,
                    member_count: members.length + 1,
                },
            ])
            .select()
            .single();

        if (chamberError) throw chamberError;

        const chamberId = chamber.id;

        const memberInserts = [
            {
                chamber_id: chamberId,
                user_id: userId,
                joined_at: new Date().toISOString(),
                is_moderator: true,
            },
            ...members.map((uid: any) => ({
                chamber_id: chamberId,
                user_id: uid,
                joined_at: new Date().toISOString(),
                is_moderator: false,
            })),
        ];

        const { error: membersError } = await supabase.from('chamber_members').insert(memberInserts);
        if (membersError) throw membersError;

        res.status(201).json({ message: 'Chamber created successfully', chamber });
    } catch (err) {
        console.error('Error creating chamber:', err);
        res.status(500).json({ error: 'Failed to create chamber' });
    }
};

// get conversion
export const getUserChambers = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id: userId } = req.user!;

        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }

        // First, fetch owned chambers with last message
        const { data: ownedChambers, error: ownedError } = await supabase
            .from('custom_chambers')
            .select(`
                *,
                creator:profiles!creator_id(
                    first_name,
                    last_name,
                    avatar_url
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

        if (ownedError) throw ownedError;

        // Then fetch member chambers with last message and creator info
        const { data: memberChambers, error: memberError } = await supabase
            .from('chamber_members')
            .select(`
                chamber_id, 
                chambers:custom_chambers(
                    *,
                    creator:profiles!creator_id(
                        first_name,
                        last_name,
                        avatar_url
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

        if (memberError) throw memberError;

        const joinedChambers = memberChambers
            .map((item: any) => item.chambers)
            .filter((chamber: any) => !!chamber);

        const allChambers = [...ownedChambers, ...joinedChambers].map((chamber: any) => ({
            id: chamber.id,
            chat_id: chamber.id,
            chamber_id: chamber.id,
            chamber_name: chamber.name,
            name: chamber.name,
            description: chamber.description,
            is_public: chamber.is_public,
            is_active: chamber.is_active,
            is_chamber: true,
            creator_id: chamber.creator_id,
            tags: chamber.tags || [],
            member_count: chamber.member_count || 0,
            updated_at: chamber.updated_at,
            last_message: chamber.last_message?.[0] ? {
                id: chamber.last_message[0].id,
                message: chamber.last_message[0].message,
                created_at: chamber.last_message[0].created_at,
                sender_id: chamber.last_message[0].sender_id
            } : null,
            creator: {
                id: chamber.creator_id,
                user_name: `${chamber.creator?.first_name || ''} ${chamber.creator?.last_name || ''}`.trim() || 'Creator Name',
                avatar_url: chamber.creator?.avatar_url || '',
            }
        }));

        res.status(200).json({
            success: true,
            data: allChambers,
            pagination: {
                total: allChambers.length,
                page: 1,
                pages: 1,
                hasMore: false
            }
        });
    } catch (err) {
        console.error('Error fetching user chambers:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chambers'
        });
    }
};

// get chamber members
export const getChamberMembers = async (req: Request, res: Response): Promise<any> => {
    try {
        const { chamber_id } = req.params;
        const { id: userId } = req.user!;

        if (!chamber_id) {
            return res.status(400).json({ error: 'Missing chamber_id' });
        }

        const { data: chamber, error: chamberError } = await supabase
            .from('custom_chambers')
            .select('is_public')
            .eq('id', chamber_id)
            .single();

        if (chamberError || !chamber) {
            return res.status(404).json({ error: 'Chamber not found' });
        }

        if (!chamber.is_public) {
            const { data: membership, error: membershipError } = await supabase
                .from('chamber_members')
                .select('user_id')
                .eq('chamber_id', chamber_id)
                .eq('user_id', userId)
                .single();

            if (membershipError || !membership) {
                return res.status(403).json({ error: 'Not authorized to view this chamber' });
            }
        }

        const { data: members, error: membersError } = await supabase
            .from('chamber_members')
            .select(`
                user_id,
                is_moderator,
                joined_at,
                profiles:user_id (
                    id,
                    user_name,
                    avatar_img
                )
            `)
            .eq('chamber_id', chamber_id);

        if (membersError) throw membersError;

        const formattedMembers = members.map((member: any) => ({
            id: member.user_id,
            chamber_id,
            user_id: member.user_id,
            user_name: member.profiles.user_name,
            avatar_img: member.profiles.avatar_img,
            is_moderator: member.is_moderator,
            joined_at: member.joined_at,
            online: false
        }));

        res.status(200).json({
            success: true,
            data: {
                data: formattedMembers,
                pagination: {
                    total: formattedMembers.length,
                    page: 1,
                    pages: 1,
                    hasMore: false
                }
            }
        });
    } catch (err) {
        console.error('Error fetching chamber members:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chamber members'
        });
    }
};


// ----------------------- messages ----------------------
// get direct messages
export const getDirectMessages = async (req: Request, res: Response): Promise<any> => {
    const { chatId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    try {
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const offset = (pageNumber - 1) * limitNumber;

        const { data: chat, error: chatError } = await supabase
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

        // Get messages for this chat
        const { data, error, count } = await supabase
            .from('chatmessages')
            .select('*', { count: 'exact' })
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true })
            .range(offset, offset + limitNumber - 1);

        if (error) throw error;

        const totalItems = count || 0;
        const hasMore = totalItems > pageNumber * limitNumber;

        return res.status(200).json({
            success: true,
            data: data || [],
            pagination: {
                currentPage: pageNumber,
                limit: limitNumber,
                totalItems,
                totalPages: Math.ceil(totalItems / limitNumber),
                hasMore
            }
        });

    } catch (error) {
        console.error('Error fetching messages:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch messages'
        });
    }
};

// Get all public messages (with pagination)
export const getPublicMessages = async (req: Request, res: Response): Promise<any> => {
    const { page = 1, limit = 50 } = req.query;

    try {
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const offset = (pageNumber - 1) * limitNumber;

        const { data, error, count } = await supabase
            .from('public_chat')
            .select(`
                id,
                message,
                is_edited,
                is_deleted,
                created_at,
                updated_at,
                sender:profiles(id, first_name, last_name, avatar_url)
            `, { count: 'exact' })
            .order('created_at', { ascending: true })
            .range(offset, offset + limitNumber - 1);

        if (error) throw error;

        const totalItems = count || 0;
        const hasMore = totalItems > pageNumber * limitNumber;

        return res.json({
            success: true,
            data: data || [],
            pagination: {
                currentPage: pageNumber,
                limit: limitNumber,
                totalItems,
                totalPages: Math.ceil(totalItems / limitNumber),
                hasMore
            }
        });

    } catch (error) {
        console.error('Error fetching public messages:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch messages'
        });
    }
};

export const getTravelMessages = async (req: Request, res: Response): Promise<any> => {
    const { page = 1, limit = 50 } = req.query;

    try {
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const offset = (pageNumber - 1) * limitNumber;

        const { data, error, count } = await supabase
            .from('travel_chat')
            .select(`
                id,
                message,
                is_edited,
                is_deleted,
                created_at,
                updated_at,
                sender:profiles(id, first_name, last_name, avatar_url)
            `, { count: 'exact' })
            .order('created_at', { ascending: true })
            .range(offset, offset + limitNumber - 1);

        if (error) throw error;

        const totalItems = count || 0;
        const hasMore = totalItems > pageNumber * limitNumber;

        return res.json({
            success: true,
            data: data || [],
            pagination: {
                currentPage: pageNumber,
                limit: limitNumber,
                totalItems,
                totalPages: Math.ceil(totalItems / limitNumber),
                hasMore
            }
        });

    } catch (error) {
        console.error('Error fetching public messages:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch messages'
        });
    }
};

export const getChamberMessages = async (req: Request, res: Response): Promise<any> => {
    try {
        const { chamber_id } = req.params;
        const { id: userId } = req.user!;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        if (!chamber_id) {
            return res.status(400).json({ error: 'Missing chamber_id' });
        }

        const { data: chamber, error: chamberError } = await supabase
            .from('custom_chambers')
            .select('is_public')
            .eq('id', chamber_id)
            .single();

        if (chamberError || !chamber) {
            return res.status(404).json({ error: 'Chamber not found' });
        }

        if (!chamber.is_public) {
            const { data: membership, error: membershipError } = await supabase
                .from('chamber_members')
                .select('user_id')
                .eq('chamber_id', chamber_id)
                .eq('user_id', userId)
                .single();

            if (membershipError || !membership) {
                return res.status(403).json({ error: 'Not authorized to view this chamber' });
            }
        }

        const { data: messages, error: messagesError, count } = await supabase
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
                profiles: sender_id (id, user_name, avatar_img),
                replied_message: reply_to (id, message, sender_id, profiles: sender_id (id, user_name))
            `, { count: 'exact' })
            .eq('chamber_id', chamber_id)
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (messagesError) throw messagesError;

        const formattedMessages = messages.map((message: any) => ({
            id: message.id,
            chamber_id: message.chamber_id,
            sender_id: message.sender_id,
            message: message.message,
            has_media: message.has_media,
            media: message.media,
            message_type: message.message_type,
            reply_to: message.reply_to,
            is_edited: message.is_edited,
            is_deleted: message.is_deleted,
            created_at: message.created_at,
            updated_at: message.updated_at,
            deleted_at: message.deleted_at,
            sender: {
                id: message.sender_id,
                user_name: message.profiles.user_name,
                avatar_img: message.profiles.avatar_img
            },
            replied_message: message.reply_to ? {
                id: message.replied_message.id,
                message: message.replied_message.message,
                sender_id: message.replied_message.sender_id,
                sender: {
                    id: message.replied_message.sender_id,
                    user_name: message.replied_message.profiles.user_name
                }
            } : null
        }));

        const totalPages = Math.ceil((count || 0) / limit);

        res.status(200).json({
            success: true,
            data: {
                data: formattedMessages.reverse(),
                pagination: {
                    total: count || 0,
                    page,
                    pages: totalPages,
                    hasMore: page < totalPages
                }
            }
        });
    } catch (err) {
        console.error('Error fetching chamber messages:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chamber messages'
        });
    }
};