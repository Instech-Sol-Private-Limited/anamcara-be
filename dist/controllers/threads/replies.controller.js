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
exports.updateReplyReaction = exports.getReplies = exports.updateReply = exports.deleteReply = exports.createReply = void 0;
const app_1 = require("../../app");
// add new comment
const createReply = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { content, comment_id, } = req.body;
        const { id: user_id, first_name, last_name } = req.user;
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
        const { data: threadData, error: threadError } = yield app_1.supabase
            .from('threadcomments')
            .select('id')
            .eq('id', comment_id)
            .single();
        if (threadError || !threadData) {
            return res.status(400).json({ error: 'Parent comment not found!' });
        }
        const { data, error } = yield app_1.supabase
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
    }
    catch (err) {
        console.error('Unexpected error in adding reply:', err);
        return res.status(500).json({
            error: 'Internal server error while creating reply.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.createReply = createReply;
// delete comment
const deleteReply = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { reply_id } = req.params;
        const { id: user_id, role } = req.user;
        const { data: comment, error: fetchError } = yield app_1.supabase
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
        const { error: deleteError } = yield app_1.supabase
            .from('threadsubcomments')
            .update({
            is_deleted: true,
        })
            .eq('id', reply_id);
        if (deleteError) {
            return res.status(500).json({ error: deleteError.message });
        }
        return res.status(200).json({ message: 'Reply deleted successfully!' });
    }
    catch (err) {
        console.error('Unexpected error in deleteComment:', err);
        return res.status(500).json({
            error: 'Internal server error while deleting reply.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.deleteReply = deleteReply;
// update comment
const updateReply = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { reply_id } = req.params;
        const { content } = req.body;
        const { id: user_id, role } = req.user;
        const { data: existingComment, error: fetchError } = yield app_1.supabase
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
        const { error: updateError } = yield app_1.supabase
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
    }
    catch (err) {
        console.error('Unexpected error in updateComment:', err);
        return res.status(500).json({
            error: 'Internal server error while updating comment.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.updateReply = updateReply;
// get all comment by thread_id
const getReplies = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { comment_id } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    if (!comment_id) {
        return res.status(400).json({ error: 'Thread ID is required.' });
    }
    const { data: replies, error } = yield app_1.supabase
        .from('threadsubcomments')
        .select(`
            *,
            profiles!inner(avatar_url)
        `)
        .eq('comment_id', comment_id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) {
        console.error('Error fetching subcomments:', error);
        return res.status(500).json({ error: error.message });
    }
    const commentsWithReactions = yield Promise.all(replies.map((reply) => __awaiter(void 0, void 0, void 0, function* () {
        let userReaction = null;
        if (user_id) {
            const { data: reactionData, error: reactionError } = yield app_1.supabase
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
        return Object.assign(Object.assign({}, reply), { user_reaction: userReaction });
    })));
    return res.status(200).json({ replies: commentsWithReactions });
});
exports.getReplies = getReplies;
// apply like/dislike
const updateReplyReaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { reply_id } = req.params;
    const { type } = req.body;
    const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    const { data: existing, error: fetchError } = yield app_1.supabase
        .from('thread_reactions')
        .select('*')
        .eq('user_id', user_id)
        .eq('target_id', reply_id)
        .eq('target_type', 'reply')
        .single();
    if (fetchError && fetchError.code !== 'PGRST116') {
        return res.status(500).json({ error: fetchError.message });
    }
    const { data: replyData, error: replyError } = yield app_1.supabase
        .from('threadsubcomments')
        .select('total_likes, total_dislikes')
        .eq('id', reply_id)
        .eq('is_deleted', false)
        .single();
    if (replyError) {
        return res.status(500).json({ error: 'Reply not found!' });
    }
    let newTotalLikes = (_b = replyData === null || replyData === void 0 ? void 0 : replyData.total_likes) !== null && _b !== void 0 ? _b : 0;
    let newTotalDislikes = (_c = replyData === null || replyData === void 0 ? void 0 : replyData.total_dislikes) !== null && _c !== void 0 ? _c : 0;
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
            const { error: updateReplyError } = yield app_1.supabase
                .from('threadsubcomments')
                .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
                .eq('id', reply_id);
            if (updateReplyError)
                return res.status(500).json({ error: updateReplyError.message });
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
            .from('threadsubcomments')
            .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
            .eq('id', reply_id);
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
            .insert([{ user_id, target_id: reply_id, target_type: 'reply', type }]);
        if (insertError)
            return res.status(500).json({ error: insertError.message });
        const { error: updateCommentError } = yield app_1.supabase
            .from('threadsubcomments')
            .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
            .eq('id', reply_id);
        if (updateCommentError)
            return res.status(500).json({ error: updateCommentError.message });
        return res.status(200).json({ message: `${type} added!` });
    }
});
exports.updateReplyReaction = updateReplyReaction;
