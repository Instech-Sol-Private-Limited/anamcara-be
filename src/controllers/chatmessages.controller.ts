import { Request, Response } from 'express';
import { supabase } from '../app';

interface MessageSender {
    id: string;
    first_name: string;
    last_name: string;
    user_name: string;
    avatar_img: string;
}

interface RepliedMessage {
    id: string;
    message: string;
    sender_id: string;
    sender: MessageSender;
}

interface ChamberMessage {
    id: string;
    chamber_id: string;
    sender_id: string;
    message: string;
    has_media: boolean;
    media: string[] | null;
    message_type: string;
    reply_to: string | null;
    is_edited: boolean;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    sender: MessageSender;
    replied_message: RepliedMessage | null;
}

interface PaginatedResponse {
    success: boolean;
    data?: ChamberMessage[];
    pagination?: {
        total: number;
        page: number;
        pages: number;
        hasMore: boolean;
    };
    error?: string;
}

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
            .or(`and(user_1.eq.${userId},user_2.in.(${friendIds.join(',')})),and(user_2.eq.${userId},user_1.in.(${friendIds.join(',')}))`)
            .order('updated_at', { ascending: false });

        if (chatsError) throw chatsError;
        if (!chats || chats.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const chatIds = chats.map(chat => chat.id);

        const { data: messages, error: messagesError } = await supabase
            .from('chatmessages')
            .select('id, chat_id, sender, message, created_at, has_media, media')
            .in('chat_id', chatIds)
            .order('created_at', { ascending: false });

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
                    created_at: lastMessage.created_at,
                    sender: lastMessage.sender
                } : null,
                user: {
                    id: otherUserId,
                    user_name: profile
                        ? `${profile.first_name} ${profile.last_name}`
                        : 'Unknown User',
                    avatar_img: profile?.avatar_url || ''
                }
            };
        }).sort((a, b) => {
            const aTime = a.last_message?.created_at || a.updated_at;
            const bTime = b.last_message?.created_at || b.updated_at;
            return new Date(bTime).getTime() - new Date(aTime).getTime();
        });

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
        const {
            name,
            description = '',
            tags = [],
            members = [],
            is_public = false,
            chamber_img = null // New optional field with null default
        } = req.body;

        const { id: userId } = req.user!;

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
                    invite_code,
                    chamber_img // Added the image field (can be null)
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

        const inviteLink = `${process.env.FRONTEND_URL || 'https://yourdomain.com'}/join/${invite_code}`;

        res.status(201).json({
            message: 'Chamber created successfully',
            chamber: {
                ...chamber,
                invite_link: inviteLink,
                chamber_img // Include in response
            }
        });
    } catch (err) {
        console.error('Error creating chamber:', err);
        res.status(500).json({ error: 'Failed to create chamber' });
    }
};

// Join chamber by invite code
export const joinChamberByInvite = async (req: Request, res: Response): Promise<any> => {
    try {
        const { invite_code } = req.params;
        const { id: userId } = req.user!;

        // Find chamber by invite code
        const { data: chamber, error: chamberError } = await supabase
            .from('custom_chambers')
            .select('id, is_public')
            .eq('invite_code', invite_code)
            .single();

        if (chamberError || !chamber) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }

        // Check if user is already a member
        const { data: existingMember } = await supabase
            .from('chamber_members')
            .select('user_id')
            .eq('chamber_id', chamber.id)
            .eq('user_id', userId)
            .single();

        if (existingMember) {
            return res.status(400).json({ error: 'You are already a member of this chamber' });
        }

        // Add user to chamber
        const { error: joinError } = await supabase
            .from('chamber_members')
            .insert({
                chamber_id: chamber.id,
                user_id: userId,
                joined_at: new Date().toISOString(),
                is_moderator: false,
            });

        if (joinError) throw joinError;

        // Increment member count
        await supabase.rpc('increment_member_count', {
            chamber_id: chamber.id,
        });

        res.status(200).json({ message: 'Successfully joined chamber' });
    } catch (err) {
        console.error('Error joining chamber:', err);
        res.status(500).json({ error: 'Failed to join chamber' });
    }
};

// get all chambers
export const getAllChambers = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id: userId } = req.user!;
        const page = parseInt(req.query.page as string) || 1;
        const limit = 12;
        const offset = (page - 1) * limit;

        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }

        const { count: totalChambers } = await supabase
            .from('custom_chambers')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        const { data: chamberslist, error: ownedError } = await supabase
            .from('custom_chambers')
            .select(`
                *,
                creator:profiles!creator_id(
                    id,
                    first_name,
                    last_name,
                    avatar_url
                )
            `)
            .eq('is_active', true)
            .range(offset, offset + limit - 1)
            .order('updated_at', { ascending: false });

        if (ownedError) throw ownedError;

        const allChambers = chamberslist.map((chamber: any) => ({
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
                user_name: `${chamber.creator?.first_name || ''} ${chamber.creator?.last_name || ''}`.trim() || 'Creator Name',
                avatar_url: chamber.creator?.avatar_url || '',
            }
        }));

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
    } catch (err) {
        console.error('Error fetching user chambers:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chambers'
        });
    }
};

export const updateChamber = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id: userId } = req.user!;
        const chamberId = req.params.id;
        const {
            name,
            description,
            is_public,
            cover_img,
            chamber_img
        } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }

        if (!chamberId) {
            return res.status(400).json({ error: 'Missing chamberId' });
        }

        const { data: existingChamber, error: fetchError } = await supabase
            .from('custom_chambers')
            .select('creator_id')
            .eq('id', chamberId)
            .single();

        if (fetchError) throw fetchError;
        if (!existingChamber) {
            return res.status(404).json({ error: 'Chamber not found' });
        }
        if (existingChamber.creator_id !== userId) {
            return res.status(403).json({ error: 'Unauthorized to update this chamber' });
        }

        const updateData: any = {
            name,
            description,
            is_public,
            updated_at: new Date().toISOString()
        };

        if (cover_img) updateData.cover_img = cover_img;
        if (chamber_img) updateData.chamber_img = chamber_img;

        const { data: updatedChamber, error: updateError } = await supabase
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

        if (updateError) throw updateError;

        const formattedChamber = {
            id: updatedChamber[0].id,
            chat_id: updatedChamber[0].id,
            chamber_id: updatedChamber[0].id,
            chamber_name: updatedChamber[0].name,
            name: updatedChamber[0].name,
            description: updatedChamber[0].description,
            is_public: updatedChamber[0].is_public,
            invite_code: updatedChamber[0].invite_code,
            chamber_img: updatedChamber[0].chamber_img || '',
            cover_img: updatedChamber[0].cover_img || '',
            is_active: updatedChamber[0].is_active,
            creator_id: updatedChamber[0].creator_id,
            tags: updatedChamber[0].tags || [],
            member_count: updatedChamber[0].member_count || 0,
            created_at: updatedChamber[0].created_at,
            updated_at: updatedChamber[0].updated_at,
            creator: {
                id: updatedChamber[0].creator_id,
                user_name: `${updatedChamber[0].creator?.first_name || ''} ${updatedChamber[0].creator?.last_name || ''}`.trim() || 'Creator Name',
                avatar_url: updatedChamber[0].creator?.avatar_url || '',
            }
        };

        res.status(200).json({
            success: true,
            data: formattedChamber
        });

    } catch (err) {
        console.error('Error updating chamber:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update chamber'
        });
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
            invite_code: chamber.invite_code,
            chamber_img: chamber.chamber_img || '',
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
            .select(`
                id,
                is_public,
                creator_id,
                creator:profiles!creator_id(
                    first_name,
                    last_name,
                    avatar_url
                )
            `)
            .eq('id', chamber_id)
            .single();

        if (chamberError || !chamber) {
            return res.status(404).json({ error: 'Chamber not found' });
        }

        if (!chamber.is_public) {
            const { data: membership, error: membershipError } = await supabase
                .from('chamber_members')
                .select('user_id, is_moderator')
                .eq('chamber_id', chamber_id)
                .eq('user_id', userId)
                .single();

            if (membershipError || !membership) {
                return res.status(403).json({ error: 'Not authorized to view this chamber' });
            }
        }

        // Get all members with their profile data
        const { data: members, error: membersError } = await supabase
            .from('chamber_members')
            .select(`
                user_id,
                is_moderator,
                joined_at,
                profiles:user_id (
                    id,
                    first_name,
                    last_name,
                    avatar_url,
                    email
                )
            `)
            .eq('chamber_id', chamber_id);

        if (membersError) throw membersError;

        // Format the response
        const formattedMembers = members.map((member: any) => ({
            id: member.user_id,
            chamber_id,
            user_id: member.user_id,
            first_name: member.profiles.first_name,
            last_name: member.profiles.last_name,
            full_name: `${member.profiles.first_name} ${member.profiles.last_name}`.trim(),
            avatar_url: member.profiles.avatar_url,
            is_moderator: member.is_moderator,
            is_creator: member.user_id === chamber.creator_id,
            joined_at: member.joined_at,
            online: false,
            email: member.profiles.email || '',
        }));

        res.status(200).json({
            success: true,
            data: {
                members: formattedMembers,
                total: formattedMembers.length,
                is_public: chamber.is_public,
                creator: {
                    id: chamber.creator_id,
                    first_name: chamber.creator?.[0]?.first_name,
                    last_name: chamber.creator?.[0]?.last_name,
                    full_name: `${chamber.creator?.[0]?.first_name || ''} ${chamber.creator?.[0]?.last_name || ''}`.trim(),
                    avatar_url: chamber.creator?.[0]?.avatar_url
                },
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

        const { data: messages, error: messagesError, count } = await supabase
            .from('chatmessages')
            .select('*', { count: 'exact' })
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limitNumber - 1);

        if (messagesError) throw messagesError;

        const messageIds = messages?.map(msg => msg.id) || [];

        let reactionsData: Record<string, any> = {};
        if (messageIds.length > 0) {
            const { data: reactions, error: reactionsError } = await supabase
                .from('chat_reactions')
                .select('*')
                .in('target_id', messageIds);

            if (reactionsError) throw reactionsError;

            reactionsData = reactions?.reduce((acc, reaction) => {
                if (!acc[reaction.target_id]) {
                    acc[reaction.target_id] = [];
                }
                acc[reaction.target_id].push(reaction);
                return acc;
            }, {} as Record<string, any[]>);
        }

        const messagesWithReactions = messages?.map(message => {
            const messageReactions = reactionsData[message.id] || [];
            const reactions = messageReactions.reduce((acc: any, reaction: any) => {
                if (!acc[reaction.type]) {
                    acc[reaction.type] = [];
                }
                acc[reaction.type].push(reaction.user_id);
                return acc;
            }, {} as Record<string, string[]>);

            return {
                ...message,
                reactions: Object.keys(reactions).length > 0 ? reactions : undefined
            };
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

        const { data: messages, error: messagesError, count } = await supabase
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

        if (messagesError) throw messagesError;

        const messageIds = messages?.map(msg => msg.id) || [];

        let reactionsData: Record<string, any> = {};
        if (messageIds.length > 0) {
            const { data: reactions, error: reactionsError } = await supabase
                .from('chat_reactions')
                .select('*')
                .in('target_id', messageIds)
                .eq('target_type', 'public_chat_message');

            if (reactionsError) throw reactionsError;

            reactionsData = reactions?.reduce((acc, reaction) => {
                if (!acc[reaction.target_id]) {
                    acc[reaction.target_id] = [];
                }
                acc[reaction.target_id].push(reaction);
                return acc;
            }, {} as Record<string, any[]>);
        }

        const messagesWithReactions = messages?.map(message => {
            const messageReactions = reactionsData[message.id] || [];
            const reactions = messageReactions.reduce((acc: any, reaction: any) => {
                if (!acc[reaction.type]) {
                    acc[reaction.type] = [];
                }
                acc[reaction.type].push(reaction.user_id);
                return acc;
            }, {} as Record<string, string[]>);

            return {
                ...message,
                reactions: reactions
            };
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
                reply_to,
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

export const getChamberMessages = async (req: Request, res: Response<PaginatedResponse>): Promise<void> => {
    try {
        const { chamber_id } = req.params;
        const { id: userId } = req.user!;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        if (!chamber_id) {
            res.status(400).json({ success: false, error: 'Missing chamber_id' });
            return;
        }

        // Verify chamber exists and check access
        const { data: chamber, error: chamberError } = await supabase
            .from('custom_chambers')
            .select('is_public')
            .eq('id', chamber_id)
            .single();

        if (chamberError || !chamber) {
            res.status(404).json({ success: false, error: 'Chamber not found' });
            return;
        }

        // Check membership for private chambers
        if (!chamber.is_public) {
            const { data: membership, error: membershipError } = await supabase
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

        // Fetch messages with pagination
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
                profiles: sender_id (id, first_name, last_name, avatar_url, email),
                replied_message: reply_to (id, message, sender_id, profiles: sender_id (id, first_name, last_name, avatar_url, email))
            `, { count: 'exact' })
            .eq('chamber_id', chamber_id)
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (messagesError) {
            throw messagesError;
        }

        const formattedMessages: ChamberMessage[] = messages.map((message: any) => {
            const media = message.has_media
                ? Array.isArray(message.media)
                    ? message.media.filter((item: string | null) => item !== null)
                    : message.media
                        ? [message.media]
                        : null
                : null;

            return {
                id: message.id,
                chamber_id: message.chamber_id,
                sender_id: message.sender_id,
                message: message.message,
                has_media: message.has_media,
                media: media,
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
                } : null
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

    } catch (err) {
        console.error('Error fetching chamber messages:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chamber messages'
        });
    }
};