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
        const { name, description = '', tags = [], members = [], is_public = true } = req.body;
        const { id: userId } = req.user!;

        if (!name || !userId) {
            return res.status(400).json({ error: 'Missing chamber name or userId' });
        }

        const { data: chamber, error: chamberError } = await supabase
            .from('custom_chambers')
            .insert([
                {
                    name,
                    description: '',
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


