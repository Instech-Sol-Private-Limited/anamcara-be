import { supabase } from "../app";
import { sendNotification } from "../sockets/emitNotification";

export interface PostValidationError {
    field?: string;
    message: string;
}

export interface PostData {
    content?: string;
    media_url?: string;
    media_type?: 'image' | 'video';
    feeling_emoji?: string;
    feeling_label?: string;
    feeling_type?: 'feeling' | 'activity';
    question_category?: string;
    question_title?: string;
    question_description?: string;
    question_color?: string;
    poll_options?: string[];
    embedded_items?: any;
    is_chamber_post?: boolean;
    chamber_id?: string;
}

export interface ChamberMember {
    user_id: string;
    role?: string;
}

export interface UserProfile {
    id: string;
    email: string;
    first_name: string;
    last_name?: string;
    avatar_url?: string;
    username?: string;
}

export const validatePostRequest = (body: any): PostValidationError[] => {
    const errors: PostValidationError[] = [];
    const {
        content,
        media_url,
        poll_options,
        question_category,
        embedded_items,
        is_chamber_post,
        chamber_id
    } = body;

    const hasContent = content?.trim();
    const hasMedia = media_url;
    const hasPoll = poll_options?.length > 0;
    const hasQuestion = question_category;
    const hasEmbedded = embedded_items;

    if (!hasContent && !hasMedia && !hasPoll && !hasQuestion && !hasEmbedded) {
        errors.push({ message: 'Post must contain content, media, poll, question, or embedded content' });
    }

    // Validate chamber_id when is_chamber_post is true
    if (is_chamber_post && !chamber_id) {
        errors.push({ field: 'chamber_id', message: 'Chamber ID is required for chamber posts' });
    }

    // Validate chamber_id format if provided
    if (chamber_id && typeof chamber_id !== 'string') {
        errors.push({ field: 'chamber_id', message: 'Chamber ID must be a valid UUID string' });
    }

    if (hasPoll) {
        if (!Array.isArray(poll_options)) {
            errors.push({ field: 'poll_options', message: 'Poll options must be an array' });
        } else if (poll_options.length < 2) {
            errors.push({ field: 'poll_options', message: 'Poll must have at least 2 options' });
        } else if (poll_options.length > 10) {
            errors.push({ field: 'poll_options', message: 'Poll cannot have more than 10 options' });
        }

        const validOptions = poll_options.filter((opt: any) =>
            opt && typeof opt === 'string' && opt.trim().length > 0
        );
        if (validOptions.length < 2) {
            errors.push({ field: 'poll_options', message: 'Poll options must contain at least 2 valid choices' });
        }
    }

    if (hasEmbedded) {
        if (typeof embedded_items !== 'object' || embedded_items === null) {
            errors.push({ field: 'embedded_items', message: 'Embedded items must be a valid object' });
        }
    }

    if (hasMedia) {
        const validMediaTypes = ['image', 'video'];
        if (body.media_type && !validMediaTypes.includes(body.media_type)) {
            errors.push({ field: 'media_type', message: 'Media type must be either "image" or "video"' });
        }
    }

    return errors;
};

export const getChamberMonetizationStatus = async (chamberId: string): Promise<{ isPaid: boolean; monetization: any }> => {
    try {
        const { data: chamber, error } = await supabase
            .from('custom_chambers')
            .select('monetization')
            .eq('id', chamberId)
            .single();

        if (error) {
            console.error('Error fetching chamber monetization:', error);
            return { isPaid: false, monetization: null };
        }

        const monetization = chamber?.monetization;
        const isPaid = monetization?.enabled === true;
        return { isPaid, monetization };
    } catch (error) {
        console.error('Error checking chamber monetization:', error);
        return { isPaid: false, monetization: null };
    }
};

export const allocateSoulpointsForPost = async (userId: string, isChamberPost: boolean, chamberId?: string): Promise<number> => {
    try {
        let points = 5;

        if (isChamberPost && chamberId) {
            const { isPaid } = await getChamberMonetizationStatus(chamberId);
            points = isPaid ? 20 : 10;
        }

        await updateUserSoulpoints(userId, points);
        return points;
    } catch (error) {
        console.error('Failed to allocate soulpoints:', error);
        const fallbackPoints = 5;
        try {
            await updateUserSoulpoints(userId, fallbackPoints);
        } catch (fallbackError) {
            console.error('Failed to allocate fallback soulpoints:', fallbackError);
        }
        return fallbackPoints;
    }
};

export const determinePostType = (data: {
    poll_options?: any[];
    question_category?: string;
    embedded_items?: any;
}): 'regular' | 'question' | 'poll' | 'embedded' => {
    if ((data as any).poll_options?.length > 0) {
        return 'poll';
    }
    if (data.question_category) {
        return 'question';
    }
    if (data.embedded_items) {
        return 'embedded';
    }
    return 'regular';
};

export const updateUserSoulpoints = async (userId: string, points: number): Promise<void> => {
    try {
        const { error } = await supabase.rpc("increment_soulpoints", {
            p_user_id: userId,
            p_points: points,
        });

        if (error) {
            console.error("Failed to update soulpoints:", error);
            throw error;
        }
    } catch (error) {
        console.error("Error updating soulpoints:", error);
        throw error;
    }
};

export const sendPostCreationNotification = async (userId: string, postId: string, postType: string, soulpoints: number, isChamberPost: boolean = false, chamberName?: string): Promise<void> => {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('email, first_name')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return;
        }

        if (profile) {
            let message = `Post created successfully! +${soulpoints} SoulPoints (SP) added to your profile`;

            if (isChamberPost && chamberName) {
                message = `Post created in ${chamberName}! +${soulpoints} soulpoints added to your profile`;
            }

            await sendNotification({
                recipientEmail: profile.email,
                recipientUserId: userId,
                actorUserId: null,
                threadId: postId,
                message: message,
                type: 'post_creation',
                metadata: {
                    soulpoints: soulpoints,
                    post_id: postId,
                    post_type: postType,
                    user_name: profile.first_name,
                    is_chamber_post: isChamberPost,
                    chamber_name: chamberName
                }
            });
        }
    } catch (error) {
        console.error('Error sending notification:', error);
    }
};

export const notifyChamberMembers = async (chamberId: string, postId: string, authorId: string): Promise<void> => {
    try {
        const { data: members, error } = await supabase
            .from('chamber_members')
            .select(`
                user_id,
                profiles (
                    id,
                    first_name,
                    last_name,
                    email
                )
            `)
            .eq('chamber_id', chamberId)
            .neq('user_id', authorId);

        if (error) {
            console.error('Error fetching chamber members:', error);
            return;
        }

        if (members && members.length > 0) {
            const notificationPromises = members.map(async (member: any) => {
                const profile = member.profiles;
                if (profile && profile.email) {
                    return sendNotification({
                        recipientEmail: profile.email,
                        recipientUserId: member.user_id,
                        actorUserId: authorId,
                        threadId: postId,
                        message: 'New post in your chamber',
                        type: 'chamber_post',
                        metadata: {
                            chamber_id: chamberId,
                            post_id: postId,
                            author_id: authorId,
                            member_name: `${profile.first_name} ${profile.last_name || ''}`.trim()
                        }
                    });
                } else {
                    console.warn(`No email found for user ${member.user_id}, skipping notification`);
                    return Promise.resolve();
                }
            });

            await Promise.all(notificationPromises);
            console.log(`Notified ${members.length} chamber members about new post`);
        }
    } catch (error) {
        console.error('Error notifying chamber members:', error);
    }
};

export const checkChamberPermission = async (chamberId: string, userId: string): Promise<boolean> => {
    try {
        const { data: chamberMember, error } = await supabase
            .from('chamber_members')
            .select('id, role')
            .eq('chamber_id', chamberId)
            .eq('user_id', userId)
            .single();

        if (error || !chamberMember) {
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error checking chamber permission:', error);
        return false;
    }
};

export const createPostInDatabase = async (postData: any) => {
    const { data, error } = await supabase
        .from('posts')
        .insert(postData)
        .select(`
      *,
      profiles (
        id,
        first_name,
        last_name,
        avatar_url,
        email
      )
    `)
        .single();

    return { data, error };
};