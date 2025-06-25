import { connectedUsers } from ".";
import { io, supabase } from "../app";

async function verifyChamberPermissions(
    chamber_id: string,
    user_id: string
): Promise<{ isCreator: boolean; isModerator: boolean }> {
    const [{ data: chamber }, { data: membership }] = await Promise.all([
        supabase
            .from('custom_chambers')
            .select('creator_id')
            .eq('id', chamber_id)
            .single(),
        supabase
            .from('chamber_members')
            .select('is_moderator')
            .eq('chamber_id', chamber_id)
            .eq('user_id', user_id)
            .single()
    ]);

    return {
        isCreator: chamber?.creator_id === user_id,
        isModerator: membership?.is_moderator ?? false
    };
}

async function notifyChamberMembers(
    chamber_id: string,
    event: string,
    payload: any
) {
    const { data: membersWithEmails, error } = await supabase
        .from('chamber_members')
        .select(`
      user_id,
      profiles:user_id!inner(email)
    `)
        .eq('chamber_id', chamber_id);

    if (error) {
        console.error('Error fetching chamber members:', error);
        return;
    }

    (membersWithEmails as any[]).forEach((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        const email = profile?.email;
        if (email && connectedUsers.has(email)) {
            const sockets = connectedUsers.get(email);
            sockets?.forEach(socketId => {
                io.to(socketId).emit(event, payload);
            });
        }
    });
}

export {
    verifyChamberPermissions,
    notifyChamberMembers
}