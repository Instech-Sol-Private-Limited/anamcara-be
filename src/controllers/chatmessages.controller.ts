import { Request, Response } from 'express';
import { supabase } from '../app';

// get conversion
export const getUserConversations = async (req: Request, res: Response): Promise<any> => {
    const { userId } = req.params;

    const { data, error } = await supabase
        .from('chatmessages')
        .select('id, sender, receiver, content, created_at')
        .or(`sender.eq.${userId},receiver.eq.${userId}`)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    if (!data || data.length === 0) {
        return res.json({ success: true, data: [] });
    }

    const conversations = new Map<string, any>();

    for (const msg of data) {
        const otherUser = msg.sender === userId ? msg.receiver : msg.sender;
        if (!conversations.has(otherUser)) {
            conversations.set(otherUser, msg);
        }
    }

    const otherUserIds = Array.from(conversations.keys());

    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', otherUserIds);

    if (profileError) return res.status(500).json({ error: profileError.message });

    const profileMap = new Map(profiles.map(p => [p.id, p]));

    const formatted = Array.from(conversations.values()).map(msg => {
        const otherId = msg.sender === userId ? msg.receiver : msg.sender;
        const profile = profileMap.get(otherId);

        return {
            ...msg,
            user: {
                id: otherId,
                user_name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`,
                avatar_img: profile?.avatar_url ?? ''
            }
        };
    });

    return res.json({ success: true, data: formatted });
};

// get direct messages
export const getDirectMessages = async (req: Request, res: Response): Promise<any> => {
    const { user1, user2 } = req.params;
    console.log(user1, user2)
    const { data, error } = await supabase
        .from('chatmessages')
        .select('*')
        .or(
            `and(sender.eq.${user1},receiver.eq.${user2}),and(sender.eq.${user2},receiver.eq.${user1})`
        )
        .order('created_at', { ascending: true });
    if (error) {
        return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data: data || [] });
};

// user frineds
export const getUserFriends = async (req: Request, res: Response): Promise<any> => {
    const { userId } = req.params;

    try {
        const { data, error } = await supabase
            .from('friendships')
            .select('id, sender_id, receiver_id, status')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .eq('status', 'accepted');

        if (error) return res.status(500).json({ success: false, error: error.message });

        const friendIds = data.map((entry) =>
            entry.sender_id === userId ? entry.receiver_id : entry.sender_id
        );

        if (friendIds.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const { data: friendsData, error: profileError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, email')
            .in('id', friendIds);

        if (profileError) return res.status(500).json({ success: false, error: profileError.message });

        const formatted = friendsData.map(profile => ({
            id: profile.id,
            user_name: `${profile.first_name} ${profile.last_name}`,
            avatar_img: profile.avatar_url,
            email: profile.email
        }));

        return res.status(200).json({ success: true, data: formatted });

    } catch (err) {
        return res.status(500).json({ success: false, error: 'Something went wrong.' });
    }
};
