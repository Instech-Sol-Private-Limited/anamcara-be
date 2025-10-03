import { connectedUsers } from ".";
import { io, supabase } from "../app";

export const getUserFriends = async (email: string): Promise<string[]> => {
    const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

    if (profileError || !userProfile?.id) return [];

    const userId = userProfile.id;

    const { data: friendships, error: friendshipsError } = await supabase
        .from('friendships')
        .select('sender_id, receiver_id')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .eq('status', 'accepted');

    if (friendshipsError || !friendships) return [];

    const friendIds = friendships.map(friendship =>
        friendship.sender_id === userId
            ? friendship.receiver_id
            : friendship.sender_id
    );
    const uniqueFriendIds = [...new Set(friendIds)];

    if (uniqueFriendIds.length === 0) return [];

    const { data: friendProfiles, error: friendsError } = await supabase
        .from('profiles')
        .select('email')
        .in('id', uniqueFriendIds);

    if (friendsError || !friendProfiles) return [];

    return friendProfiles
        .map(profile => profile.email)
        .filter((email): email is string => !!email);
};

export const getUserEmailFromId = async (userId: string): Promise<string | null> => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .single();

        if (error || !data) {
            console.error(`❌ Failed to fetch email for user ${userId}:`, error?.message);
            return null;
        }

        return data.email;
    } catch (err) {
        console.error(`❌ Error in getUserEmailFromId for ${userId}:`, err);
        return null;
    }
};

export const getUserIdFromEmail = async (userEmail: string): Promise<string | null> => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', userEmail)
            .single();

        if (error || !data) {
            console.error(`❌ Failed to fetch email for user ${userEmail}:`, error?.message);
            return null;
        }

        return data.id;
    } catch (err) {
        console.error(`❌ Error in getUserEmailFromId for ${userEmail}:`, err);
        return null;
    }
};

export async function getChatParticipants(chatId: string): Promise<string[]> {
    const { data: chat } = await supabase
        .from('chats')
        .select('user_1, user_2')
        .eq('id', chatId)
        .single();

    if (!chat) {
        return [];
    }

    return [chat.user_1, chat.user_2];
}

export async function getUnseenMessagesCount(userId: string): Promise<number> {
    try {
        const { data: userChats, error: chatsError } = await supabase
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

        const { count, error } = await supabase
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

    } catch (error: any) {
        console.error('Unseen count error:', error);
        throw error;
    }
}

export async function updateUnseenCountForUser(userEmail: string) {
    try {
        const userId = await getUserIdFromEmail(userEmail);
        if (userId) {
            const unseenCount = await getUnseenMessagesCount(userId);

            if (connectedUsers.has(userEmail)) {
                connectedUsers.get(userEmail)!.forEach(socketId => {
                    io.to(socketId).emit('unseen_count_update', { count: unseenCount });
                });
            }
        }
    } catch (error) {
        console.error('Update unseen count for user error:', error);
    }
}

export async function updateUnseenCountForChatParticipants(chatId: string) {
    try {
        const { data: chat } = await supabase
            .from('chats')
            .select('user_1, user_2')
            .eq('id', chatId)
            .single();

        if (chat) {
            const [user1Email, user2Email] = await Promise.all([
                getUserEmailFromId(chat.user_1),
                getUserEmailFromId(chat.user_2)
            ]);

            // Update count for both users
            if (user1Email) await updateUnseenCountForUser(user1Email);
            if (user2Email) await updateUnseenCountForUser(user2Email);
        }
    } catch (error) {
        console.error('Update unseen count for chat participants error:', error);
    }
}

