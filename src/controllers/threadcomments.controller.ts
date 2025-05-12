import { Request, Response } from 'express';
import { supabase } from '../app';

// add new comment
const createComment = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            content,
            thread_id,
            imgs = []
        } = req.body;

        const { id: user_id, first_name, last_name } = req.user!;

        const requiredFields = {
            content,
            thread_id,
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
            .from('threads')
            .select('id')
            .eq('id', thread_id)
            .single();

        if (threadError || !threadData) {
            return res.status(400).json({ error: 'Invalid Thread Id. No matching thread found.' });
        }

        const { data, error } = await supabase
            .from('threadcomments')
            .insert([{
                content,
                thread_id,
                imgs,
                user_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
                user_id
            }])
            .select();

        if (error) {
            console.error('Supabase insert error:', error);
            return res.status(500).json({
                error: error.message || 'Unknown error occurred while creating comment.',
                details: error.details || null,
                hint: error.hint || null,
            });
        }

        if (!data || data.length === 0) {
            return res.status(500).json({ error: 'Comment creation failed. No data returned.' });
        }

        return res.status(201).json({
            message: 'Comment created successfully!',
        });

    } catch (err: any) {
        console.error('Unexpected error in createComment:', err);
        return res.status(500).json({
            error: 'Internal server error while creating comment.',
            message: err.message || 'Unexpected failure.',
        });
    }
};

// delete comment
const deleteComment = async (
    req: Request<{ comment_id: string }> & { user?: { id: string; role?: string } },
    res: Response
): Promise<any> => {
    try {
        const { comment_id } = req.params;
        const { id: user_id, role } = req.user!;

        const { data: comment, error: fetchError } = await supabase
            .from('threadcomments')
            .select('id, user_id')
            .eq('id', comment_id)
            .single();

        if (fetchError || !comment) {
            return res.status(404).json({ error: 'Comment not found!' });
        }

        const isAuthor = comment.user_id === user_id;
        const isSuperadmin = role === 'superadmin';

        if (!isAuthor && !isSuperadmin) {
            return res.status(403).json({ error: 'Permission denied!' });
        }

        const { error: deleteError } = await supabase
            .from('threadcomments')
            .delete()
            .eq('id', comment_id);

        if (deleteError) {
            return res.status(500).json({ error: deleteError.message });
        }

        return res.status(200).json({ message: 'Comment deleted successfully!' });

    } catch (err: any) {
        console.error('Unexpected error in deleteComment:', err);
        return res.status(500).json({
            error: 'Internal server error while deleting comment.',
            message: err.message || 'Unexpected failure.',
        });
    }
};

// update comment
const updateComment = async (
    req: Request<{ comment_id: string }> & { user?: { id: string; role?: string; first_name?: string; last_name?: string } },
    res: Response
): Promise<any> => {
    try {
        const { comment_id } = req.params;
        const { content } = req.body;
        const { id: user_id, role } = req.user!;

        const { data: existingComment, error: fetchError } = await supabase
            .from('threadcomments')
            .select('*')
            .eq('id', comment_id)
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
            .from('threadcomments')
            .update({ content })
            .eq('id', comment_id);

        if (updateError) {
            console.error('Supabase update error:', updateError);
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
const getComments = async (
    req: Request<{ thread_id: string }>,
    res: Response
): Promise<any> => {
    try {

        const { thread_id } = req.params;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = parseInt(req.query.offset as string) || 0;

        if (!thread_id) {
            return res.status(400).json({ error: 'Thread ID is required!' });
        }

        const { data, error } = await supabase
            .from('threadcomments')
            .select('*')
            .eq('thread_id', thread_id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) {
            console.error('Error fetching comments:', error);
            return res.status(500).json({ error: "Comment fetching failed!" });
        }

        return res.status(200).json({ comments: data });
    }
    catch (err: any) {
        return res.status(500).json({
            error: err.message || 'Unexpected failure.',
        })
    }
};

// apply like/dislike
const updateCommentReaction = async (
    req: Request<{ comment_id: string }, {}, { type: 'like' | 'dislike' }>,
    res: Response
): Promise<any> => {
    const { comment_id } = req.params;
    const { type } = req.body;
    const user_id = req.user?.id;

    if (!user_id) return res.status(401).json({ error: 'Unauthorized' });

    const { data: existing, error: fetchError } = await supabase
        .from('comment_reactions')
        .select('*')
        .eq('user_id', user_id)
        .eq('comment_id', comment_id)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        return res.status(500).json({ error: fetchError.message });
    }

    const { data: commentData, error: commentError } = await supabase
        .from('threadcomments')
        .select('total_likes, total_dislikes')
        .eq('id', comment_id)
        .single();

    if (commentError) {
        return res.status(500).json({ error: commentError.message });
    }

    let newTotalLikes = commentData?.total_likes ?? 0;
    let newTotalDislikes = commentData?.total_dislikes ?? 0;

    if (existing) {
        if (existing.type === 'like' && type === 'like') {
            newTotalLikes -= 1;

            const { error: deleteError } = await supabase
                .from('comment_reactions')
                .delete()
                .eq('user_id', user_id)
                .eq('comment_id', comment_id);

            if (deleteError) return res.status(500).json({ error: deleteError.message });

            const { error: updateError } = await supabase
                .from('threadcomments')
                .update({ total_likes: newTotalLikes })
                .eq('id', comment_id);

            if (updateError) return res.status(500).json({ error: updateError.message });

            return res.status(200).json({ message: 'Like removed.' });
        }

        if (existing.type === 'dislike' && type === 'dislike') {
            newTotalDislikes -= 1;

            const { error: deleteError } = await supabase
                .from('comment_reactions')
                .delete()
                .eq('user_id', user_id)
                .eq('comment_id', comment_id);

            if (deleteError) return res.status(500).json({ error: deleteError.message });

            const { error: updateError } = await supabase
                .from('threadcomments')
                .update({ total_dislikes: newTotalDislikes })
                .eq('id', comment_id);

            if (updateError) return res.status(500).json({ error: updateError.message });

            return res.status(200).json({ message: 'Dislike removed.' });
        }

        if (existing.type === 'like' && type === 'dislike') {
            newTotalLikes -= 1;
            newTotalDislikes += 1;

            await supabase
                .from('comment_reactions')
                .delete()
                .eq('user_id', user_id)
                .eq('comment_id', comment_id);

            const { error: insertError } = await supabase
                .from('comment_reactions')
                .insert([{ user_id, comment_id, type: 'dislike' }]);

            if (insertError) return res.status(500).json({ error: insertError.message });

            const { error: updateError } = await supabase
                .from('threadcomments')
                .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
                .eq('id', comment_id);

            if (updateError) return res.status(500).json({ error: updateError.message });

            return res.status(200).json({ message: 'Like changed to dislike.' });
        }

        if (existing.type === 'dislike' && type === 'like') {
            newTotalLikes += 1;
            newTotalDislikes -= 1;

            await supabase
                .from('comment_reactions')
                .delete()
                .eq('user_id', user_id)
                .eq('comment_id', comment_id);

            const { error: insertError } = await supabase
                .from('comment_reactions')
                .insert([{ user_id, comment_id, type: 'like' }]);

            if (insertError) return res.status(500).json({ error: insertError.message });

            const { error: updateError } = await supabase
                .from('threadcomments')
                .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
                .eq('id', comment_id);

            if (updateError) return res.status(500).json({ error: updateError.message });

            return res.status(200).json({ message: 'Dislike changed to like.' });
        }
    } else {
        if (type === 'like') {
            newTotalLikes += 1;

            const { error: insertError } = await supabase
                .from('comment_reactions')
                .insert([{ user_id, comment_id, type: 'like' }]);

            if (insertError) return res.status(500).json({ error: insertError.message });

            const { error: updateError } = await supabase
                .from('threadcomments')
                .update({ total_likes: newTotalLikes })
                .eq('id', comment_id);

            if (updateError) return res.status(500).json({ error: updateError.message });

            return res.status(200).json({ message: 'Like added.' });
        }

        if (type === 'dislike') {
            newTotalDislikes += 1;

            const { error: insertError } = await supabase
                .from('comment_reactions')
                .insert([{ user_id, comment_id, type: 'dislike' }]);

            if (insertError) return res.status(500).json({ error: insertError.message });

            const { error: updateError } = await supabase
                .from('threadcomments')
                .update({ total_dislikes: newTotalDislikes })
                .eq('id', comment_id);

            if (updateError) return res.status(500).json({ error: updateError.message });

            return res.status(200).json({ message: 'Dislike added.' });
        }
    }
};

// get user's all comment reactions by thread
const getCommentReactionsByThreadAndUser = async (
    req: Request<{ thread_id: string }>,
    res: Response
): Promise<any> => {
    const { thread_id } = req.params;
    const user_id = req.user?.id;
console.log(user_id, thread_id)
    if (!thread_id || !user_id) {
        return res.status(400).json({ error: 'Thread ID and User ID are required.' });
    }

    const { data, error } = await supabase
        .from('threadcomments')
        .select(`
        id,
        comment_reactions(type)
      `)
        .eq('thread_id', thread_id)
        .order('created_at', { ascending: true });

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    const userReactions = data.map(comment => {
        const reactionEntry = (comment as any).comment_reactions?.find(
            (r: any) => r?.user_id === user_id
        );

        return {
            comment_id: comment.id,
            reaction: reactionEntry?.type || null,
        };
    });

    return res.status(200).json({ reactions: userReactions });
};

export {
    createComment,
    deleteComment,
    updateComment,
    getComments,
    updateCommentReaction,
    getCommentReactionsByThreadAndUser,
};

