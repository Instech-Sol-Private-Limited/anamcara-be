import { supabase } from "../app";

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