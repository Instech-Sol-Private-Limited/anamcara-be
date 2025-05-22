"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCommentReaction = exports.getComments = exports.updateComment = exports.deleteComment = exports.createComment = void 0;
const app_1 = require("../../app");
// add new comment
const createComment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { content, thread_id, imgs = [] } = req.body;
        const { id: user_id, first_name, last_name } = req.user;
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
        const { data: threadData, error: threadError } = yield app_1.supabase
            .from('threads')
            .select('id')
            .eq('id', thread_id)
            .eq('is_deleted', false)
            .single();
        if (threadError || !threadData) {
            return res.status(400).json({ error: 'No thread found!' });
        }
        const { data, error } = yield app_1.supabase
            .from('threadcomments')
            .insert([{
                content,
                thread_id,
                imgs,
                user_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
                user_id
            }])
            .select();
        console.log(data, error);
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
    }
    catch (err) {
        console.error('Unexpected error in createComment:', err);
        return res.status(500).json({
            error: 'Internal server error while creating comment.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.createComment = createComment;
// delete comment
const deleteComment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { comment_id } = req.params;
        const { id: user_id, role } = req.user;
        const { data: comment, error: fetchError } = yield app_1.supabase
            .from('threadcomments')
            .select('id, user_id')
            .eq('id', comment_id)
            .eq('is_deleted', false)
            .single();
        if (fetchError || !comment) {
            return res.status(404).json({ error: 'Comment not found!' });
        }
        const isAuthor = comment.user_id === user_id;
        const isSuperadmin = role === 'superadmin';
        if (!isAuthor && !isSuperadmin) {
            return res.status(403).json({ error: 'Permission denied!' });
        }
        const { error: deleteError } = yield app_1.supabase
            .from('threadcomments')
            .update({
            is_deleted: true,
        })
            .eq('id', comment_id);
        if (deleteError) {
            return res.status(500).json({ error: deleteError.message });
        }
        return res.status(200).json({ message: 'Comment deleted successfully!' });
    }
    catch (err) {
        console.error('Unexpected error in deleteComment:', err);
        return res.status(500).json({
            error: 'Internal server error while deleting comment.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.deleteComment = deleteComment;
// update comment
const updateComment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { comment_id } = req.params;
        const { content, imgs } = req.body;
        const { id: user_id, role } = req.user;
        const { data: existingComment, error: fetchError } = yield app_1.supabase
            .from('threadcomments')
            .select('*')
            .eq('id', comment_id)
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
        const { error: updateError } = yield app_1.supabase
            .from('threadcomments')
            .update({
            content,
            imgs,
            is_edited: true
        })
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
    }
    catch (err) {
        console.error('Unexpected error in updateComment:', err);
        return res.status(500).json({
            error: 'Internal server error while updating comment.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.updateComment = updateComment;
// get all comment by thread_id
const getComments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { thread_id } = req.params;
        const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        if (!thread_id) {
            return res.status(400).json({ error: 'Thread ID is required!' });
        }
        const { data: thread, error: fetchError } = yield app_1.supabase
            .from('threads')
            .select('id')
            .eq('id', thread_id)
            .eq('is_deleted', false)
            .single();
        if (fetchError || !thread) {
            return res.status(404).json({ error: 'Thread not found!' });
        }
        const { data: comments, error } = yield app_1.supabase
            .from('threadcomments')
            .select(`
              *,
              profiles!inner(avatar_url)
            `)
            .eq('thread_id', thread_id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) {
            return res.status(500).json({ error: "Comment fetching failed!" });
        }
        const commentsWithReactions = yield Promise.all(comments.map((comment) => __awaiter(void 0, void 0, void 0, function* () {
            let userReaction = null;
            if (user_id) {
                const { data: reactionData, error: reactionError } = yield app_1.supabase
                    .from('thread_reactions')
                    .select('type')
                    .eq('user_id', user_id)
                    .eq('target_type', 'comment')
                    .eq('target_id', comment.id)
                    .maybeSingle();
                if (!reactionError && reactionData) {
                    userReaction = reactionData.type;
                }
            }
            return Object.assign(Object.assign({}, comment), { user_reaction: userReaction });
        })));
        return res.status(200).json({ comments: commentsWithReactions });
    }
    catch (err) {
        return res.status(500).json({
            error: err.message || 'Unexpected failure.',
        });
    }
});
exports.getComments = getComments;
// apply like/dislike
const updateCommentReaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { comment_id } = req.params;
    const { type } = req.body;
    const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    const { data: existing, error: fetchError } = yield app_1.supabase
        .from('thread_reactions')
        .select('*')
        .eq('user_id', user_id)
        .eq('target_id', comment_id)
        .eq('target_type', 'comment')
        .single();
    if (fetchError && fetchError.code !== 'PGRST116') {
        return res.status(500).json({ error: fetchError.message });
    }
    const { data: commentData, error: commentError } = yield app_1.supabase
        .from('threadcomments')
        .select('total_likes, total_dislikes')
        .eq('id', comment_id)
        .eq('is_deleted', false)
        .single();
    if (commentError) {
        return res.status(500).json({ error: 'Comment not found!' });
    }
    let newTotalLikes = (_b = commentData === null || commentData === void 0 ? void 0 : commentData.total_likes) !== null && _b !== void 0 ? _b : 0;
    let newTotalDislikes = (_c = commentData === null || commentData === void 0 ? void 0 : commentData.total_dislikes) !== null && _c !== void 0 ? _c : 0;
    if (existing) {
        if (existing.type === type) {
            if (type === 'like')
                newTotalLikes -= 1;
            if (type === 'dislike')
                newTotalDislikes -= 1;
            const { error: deleteError } = yield app_1.supabase
                .from('thread_reactions')
                .delete()
                .eq('id', existing.id);
            if (deleteError)
                return res.status(500).json({ error: deleteError.message });
            const { error: updateCommentError } = yield app_1.supabase
                .from('threadcomments')
                .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
                .eq('id', comment_id);
            if (updateCommentError)
                return res.status(500).json({ error: updateCommentError.message });
            return res.status(200).json({ message: `${type} removed!` });
        }
        if (existing.type === 'like') {
            newTotalLikes -= 1;
            newTotalDislikes += 1;
        }
        else {
            newTotalDislikes -= 1;
            newTotalLikes += 1;
        }
        const { error: updateError } = yield app_1.supabase
            .from('thread_reactions')
            .update({ type, updated_by: user_id })
            .eq('id', existing.id);
        if (updateError)
            return res.status(500).json({ error: updateError.message });
        const { error: updateCommentError } = yield app_1.supabase
            .from('threadcomments')
            .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
            .eq('id', comment_id);
        if (updateCommentError)
            return res.status(500).json({ error: updateCommentError.message });
        return res.status(200).json({ message: `Reaction updated to ${type}!` });
    }
    else {
        if (type === 'like')
            newTotalLikes += 1;
        if (type === 'dislike')
            newTotalDislikes += 1;
        const { error: insertError } = yield app_1.supabase
            .from('thread_reactions')
            .insert([{ user_id, target_id: comment_id, target_type: 'comment', type }]);
        if (insertError)
            return res.status(500).json({ error: insertError.message });
        const { error: updateCommentError } = yield app_1.supabase
            .from('threadcomments')
            .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
            .eq('id', comment_id);
        if (updateCommentError)
            return res.status(500).json({ error: updateCommentError.message });
        return res.status(200).json({ message: `${type} added!` });
    }
});
exports.updateCommentReaction = updateCommentReaction;
