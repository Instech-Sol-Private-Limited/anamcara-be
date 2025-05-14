import { Request, Response } from 'express';
import { supabase } from '../../app';

// add new comment
const createReply = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            content,
            comment_id,
        } = req.body;

        const { id: user_id, first_name, last_name } = req.user!;

        const requiredFields = {
            content,
            comment_id,
            user_id,
            user_name: first_name,
        };

        for (const [key, value] of Object.entries(requiredFields)) {
            if (!value) {
                const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                return res.status(400).json({ error: `${formattedKey} is required!` });
            }
        }

        const { data: threadData, error: threadError } = await supabase
            .from('threadcomments')
            .select('id')
            .eq('id', comment_id)
            .single();

        if (threadError || !threadData) {
            return res.status(400).json({ error: 'Parent comment not found!' });
        }

        const { data, error } = await supabase
            .from('threadsubcomments')
            .insert([{
                content,
                comment_id,
                user_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
                user_id
            }])
            .select();

        if (error) {
            console.error('Supabase insert error:', error);
            return res.status(500).json({
                error: error.message || 'Unknown error occurred while adding subcomment!',
                details: error.details || null,
                hint: error.hint || null,
            });
        }

        if (!data || data.length === 0) {
            return res.status(500).json({ error: 'Failed to add sucomment!' });
        }

        return res.status(201).json({
            message: 'Reply created successfully!',
        });

    } catch (err: any) {
        console.error('Unexpected error in adding reply:', err);
        return res.status(500).json({
            error: 'Internal server error while creating reply.',
            message: err.message || 'Unexpected failure.',
        });
    }
};

// delete comment
const deleteReply = async (
    req: Request<{ reply_id: string }> & { user?: { id: string; role?: string } },
    res: Response
): Promise<any> => {
    try {
        const { reply_id } = req.params;
        const { id: user_id, role } = req.user!;

        const { data: comment, error: fetchError } = await supabase
            .from('threadsubcomments')
            .select('id, user_id')
            .eq('is_deleted', false)
            .eq('id', reply_id)
            .single();

        if (fetchError || !comment) {
            return res.status(404).json({ error: 'Reply not found!' });
        }

        const isAuthor = comment.user_id === user_id;
        const isSuperadmin = role === 'superadmin';

        if (!isAuthor && !isSuperadmin) {
            return res.status(403).json({ error: 'Permission denied!' });
        }

        const { error: deleteError } = await supabase
            .from('threadsubcomments')
            .update({
                is_deleted: true,
            })
            .eq('id', reply_id);

        if (deleteError) {
            return res.status(500).json({ error: deleteError.message });
        }

        return res.status(200).json({ message: 'Reply deleted successfully!' });

    } catch (err: any) {
        console.error('Unexpected error in deleteComment:', err);
        return res.status(500).json({
            error: 'Internal server error while deleting reply.',
            message: err.message || 'Unexpected failure.',
        });
    }
};

// update comment
const updateReply = async (
    req: Request<{ reply_id: string }> & { user?: { id: string; role?: string; first_name?: string; last_name?: string } },
    res: Response
): Promise<any> => {
    try {
        const { reply_id } = req.params;
        const { content } = req.body;
        const { id: user_id, role } = req.user!;

        const { data: existingComment, error: fetchError } = await supabase
            .from('threadsubcomments')
            .select('*')
            .eq('id', reply_id)
            .eq('is_deleted', false)
            .single();

        if (fetchError || !existingComment) {
            return res.status(404).json({ error: 'Comment not found!' });
        }

        const isOwner = existingComment.user_id === user_id;
        const isSuperadmin = role === 'superadmin';

        if (!isOwner && !isSuperadmin) {
            return res.status(403).json({ error: 'Permission denied!' });
        }

        if (!content || typeof content !== 'string' || !content.trim()) {
            return res.status(400).json({ error: 'Content is required and must be a non-empty string.' });
        }

        const { error: updateError } = await supabase
            .from('threadsubcomments')
            .update({
                content,
                is_edited: true,
            })
            .eq('id', reply_id);

        if (updateError) {
            return res.status(500).json({
                error: updateError.message || 'Failed to update comment.',
                details: updateError.details || null,
                hint: updateError.hint || null,
            });
        }

        return res.status(200).json({ message: 'Comment updated successfully!' });

    } catch (err: any) {
        console.error('Unexpected error in updateComment:', err);
        return res.status(500).json({
            error: 'Internal server error while updating comment.',
            message: err.message || 'Unexpected failure.',
        });
    }
};

// get all comment by thread_id
const getReplies = async (
    req: Request<{ comment_id: string }>,
    res: Response
): Promise<any> => {
    const { comment_id } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const user_id = req.user?.id;

    if (!comment_id) {
        return res.status(400).json({ error: 'Thread ID is required.' });
    }

    const { data: replies, error } = await supabase
        .from('threadsubcomments')
        .select('*')
        .eq('comment_id', comment_id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('Error fetching subcomments:', error);
        return res.status(500).json({ error: error.message });
    }

    const commentsWithReactions = await Promise.all(replies.map(async (reply) => {
        let userReaction = null;

        if (user_id) {
            const { data: reactionData, error: reactionError } = await supabase
                .from('thread_reactions')
                .select('type')
                .eq('user_id', user_id)
                .eq('target_type', 'reply')
                .eq('target_id', reply.id)
                .maybeSingle();

            if (!reactionError && reactionData) {
                userReaction = reactionData.type;
            }
        }

        return {
            ...reply,
            user_reaction: userReaction,
        };
    }));

    return res.status(200).json({ replies: commentsWithReactions });

};

// apply like/dislike
const updateReplyReaction = async (
    req: Request<{ reply_id: string }, {}, { type: 'like' | 'dislike' }>,
    res: Response
): Promise<any> => {
    const { reply_id } = req.params;
    const { type } = req.body;
    const user_id = req.user?.id;

    const { data: existing, error: fetchError } = await supabase
        .from('thread_reactions')
        .select('*')
        .eq('user_id', user_id)
        .eq('target_id', reply_id)
        .eq('target_type', 'reply')
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        return res.status(500).json({ error: fetchError.message });
    }

    const { data: replyData, error: replyError } = await supabase
        .from('threadsubcomments')
        .select('total_likes, total_dislikes')
        .eq('id', reply_id)
        .eq('is_deleted', false)
        .single();

    if (replyError) {
        return res.status(500).json({ error: 'Reply not found!' });
    }
    
    let newTotalLikes = replyData?.total_likes ?? 0;
    let newTotalDislikes = replyData?.total_dislikes ?? 0;

    if (existing) {
        if (existing.type === type) {
            if (type === 'like') newTotalLikes -= 1;
            if (type === 'dislike') newTotalDislikes -= 1;

            const { error: deleteError } = await supabase
                .from('thread_reactions')
                .delete()
                .eq('id', existing.id);

            if (deleteError) return res.status(500).json({ error: deleteError.message });

            const { error: updateReplyError } = await supabase
                .from('threadsubcomments')
                .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
                .eq('id', reply_id);

            if (updateReplyError) return res.status(500).json({ error: updateReplyError.message });

            return res.status(200).json({ message: `${type} removed!` });
        }

        if (existing.type === 'like') {
            newTotalLikes -= 1;
            newTotalDislikes += 1;
        } else {
            newTotalDislikes -= 1;
            newTotalLikes += 1;
        }

        const { error: updateError } = await supabase
            .from('thread_reactions')
            .update({ type, updated_by: user_id })
            .eq('id', existing.id);

        if (updateError) return res.status(500).json({ error: updateError.message });

        const { error: updateCommentError } = await supabase
            .from('threadsubcomments')
            .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
            .eq('id', reply_id);

        if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

        return res.status(200).json({ message: `Reaction updated to ${type}!` });
    } else {
        if (type === 'like') newTotalLikes += 1;
        if (type === 'dislike') newTotalDislikes += 1;

        const { error: insertError } = await supabase
            .from('thread_reactions')
            .insert([{ user_id, target_id: reply_id, target_type: 'reply', type }]);

        if (insertError) return res.status(500).json({ error: insertError.message });

        const { error: updateCommentError } = await supabase
            .from('threadsubcomments')
            .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
            .eq('id', reply_id);

        if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

        return res.status(200).json({ message: `${type} added!` });
    }
};

// get user's all comment reactions by thread
// const getSubcommentReactions = async (
//     req: Request<{ comment_id: string }>,
//     res: Response
// ): Promise<any> => {
//     const { comment_id } = req.params;
//     const user_id = req.user?.id;

//     if (!comment_id || !user_id) {
//         return res.status(400).json({ error: 'Thread ID and User ID are required.' });
//     }

//     const { data, error } = await supabase
//         .from('threadsubcomments')
//         .select(`
//         id,
//         thread_subcomment_reactions(type, user_id)`)
//         .eq('thread_id', comment_id)
//         .order('created_at', { ascending: true });

//     if (error) {
//         return res.status(500).json({ error: error.message });
//     }

//     const userReactions = data.map(comment => {
//         const reactionEntry = (comment as any).comment_reactions?.find(
//             (r: any) => r?.user_id === user_id
//         );

//         return {
//             comment_id: comment.id,
//             reaction: reactionEntry?.type || null,
//         };
//     });

//     return res.status(200).json({ reactions: userReactions });
// };

export {
    createReply,
    deleteReply,
    updateReply,
    getReplies,
    updateReplyReaction,
    // getSubcommentReactions,
};

