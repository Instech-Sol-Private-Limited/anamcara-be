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
const emitNotification_1 = require("../../sockets/emitNotification");
const getCommentPreview = (content) => {
    const words = content.split(' ');
    return words.length > 5
        ? words.slice(0, 5).join(' ') + '...'
        : content;
};
// add new comment
const createReply = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { content, comment_id, } = req.body;
        const { id: user_id, first_name, last_name } = req.user;
        if (!content || !comment_id || !user_id || !first_name) {
            return res.status(400).json({ error: 'Missing required fields!' });
        }
        // Fetch parent comment (get thread_id and post_id)
        const { data: commentData, error: commentError } = yield app_1.supabase
            .from('threadcomments')
            .select('id, user_id, thread_id, post_id, content')
            .eq('id', comment_id)
            .single();
        if (commentError || !commentData) {
            return res.status(400).json({ error: 'Parent comment not found!' });
        }
        // Insert reply
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
            return res.status(500).json({ error: error.message || 'Unknown error occurred while adding reply!' });
        }
        if (!data || data.length === 0) {
            return res.status(500).json({ error: 'Failed to add reply!' });
        }
        // Determine if this is a thread or post comment
        let parentType, parentId, parentTitle, parentAuthorId;
        if (commentData.thread_id) {
            parentType = 'thread';
            parentId = commentData.thread_id;
            // Fetch thread info
            const { data: threadData } = yield app_1.supabase
                .from('threads')
                .select('title, author_id')
                .eq('id', parentId)
                .single();
            parentTitle = (threadData === null || threadData === void 0 ? void 0 : threadData.title) || 'a thread';
            parentAuthorId = threadData === null || threadData === void 0 ? void 0 : threadData.author_id;
        }
        else if (commentData.post_id) {
            parentType = 'post';
            parentId = commentData.post_id;
            // Fetch post info
            const { data: postData } = yield app_1.supabase
                .from('posts')
                .select('content, user_id')
                .eq('id', parentId)
                .single();
            parentTitle = ((_a = postData === null || postData === void 0 ? void 0 : postData.content) === null || _a === void 0 ? void 0 : _a.slice(0, 30)) || 'a post';
            parentAuthorId = postData === null || postData === void 0 ? void 0 : postData.user_id;
        }
        else {
            return res.status(400).json({ error: 'Comment is not linked to a thread or post.' });
        }
        // Notify comment author (if not self)
        if (commentData.user_id !== user_id) {
            const { data: userData } = yield app_1.supabase
                .from('profiles')
                .select('email')
                .eq('id', commentData.user_id)
                .single();
            if (userData === null || userData === void 0 ? void 0 : userData.email) {
                yield (0, emitNotification_1.sendNotification)({
                    recipientEmail: userData.email,
                    recipientUserId: commentData.user_id,
                    actorUserId: user_id,
                    threadId: parentId, // always use threadId for NotificationInput
                    message: `${first_name}${last_name ? ` ${last_name}` : ''} replied to your comment: **${getCommentPreview(commentData.content)}**`,
                    type: parentType === 'thread' ? 'reply' : 'post_reply',
                    metadata: {
                        comment_id,
                        reply_id: data[0].id,
                        replier_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
                        [`${parentType}_id`]: parentId,
                        [`${parentType}_title`]: parentTitle
                    },
                });
            }
        }
        // Optionally: notify thread/post author if different from comment author and replier
        if (parentAuthorId && parentAuthorId !== user_id && parentAuthorId !== commentData.user_id) {
            const { data: parentAuthorProfile } = yield app_1.supabase
                .from('profiles')
                .select('email')
                .eq('id', parentAuthorId)
                .single();
            if (parentAuthorProfile === null || parentAuthorProfile === void 0 ? void 0 : parentAuthorProfile.email) {
                yield (0, emitNotification_1.sendNotification)({
                    recipientEmail: parentAuthorProfile.email,
                    recipientUserId: parentAuthorId,
                    actorUserId: user_id,
                    threadId: parentId,
                    message: `${first_name}${last_name ? ` ${last_name}` : ''} replied to a comment on your ${parentType}.`,
                    type: parentType === 'thread' ? 'reply' : 'post_reply',
                    metadata: {
                        comment_id,
                        reply_id: data[0].id,
                        replier_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
                        [`${parentType}_id`]: parentId,
                        [`${parentType}_title`]: parentTitle
                    },
                });
            }
        }
        return res.status(201).json({
            message: 'Reply created successfully!',
            data: data[0]
        });
    }
    catch (err) {
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
        const { data: reply, error: fetchError } = yield app_1.supabase
            .from('threadsubcomments')
            .select('id, user_id')
            .eq('id', reply_id)
            .eq('is_deleted', false)
            .single();
        if (fetchError || !reply) {
            return res.status(404).json({ error: 'Reply not found!' });
        }
        const isAuthor = reply.user_id === user_id;
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
        return res.status(400).json({ error: 'Comment ID is required.' });
    }
    // Fetch parent comment to determine thread/post context
    const { data: commentData, error: commentError } = yield app_1.supabase
        .from('threadcomments')
        .select('thread_id, post_id')
        .eq('id', comment_id)
        .single();
    if (commentError || !commentData) {
        return res.status(404).json({ error: 'Parent comment not found!' });
    }
    const { data: replies, error } = yield app_1.supabase
        .from('threadsubcomments')
        .select(`*, profiles!inner(id, first_name, last_name, avatar_url, email)`)
        .eq('comment_id', comment_id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    const repliesWithReactions = yield Promise.all(replies.map((reply) => __awaiter(void 0, void 0, void 0, function* () {
        let userReaction = null;
        if (user_id) {
            const { data: reactionData } = yield app_1.supabase
                .from('thread_reactions')
                .select('type')
                .eq('user_id', user_id)
                .eq('target_type', 'reply')
                .eq('target_id', reply.id)
                .maybeSingle();
            if (reactionData)
                userReaction = reactionData.type;
        }
        return Object.assign(Object.assign({}, reply), { user_reaction: userReaction });
    })));
    return res.status(200).json({ replies: repliesWithReactions });
});
exports.getReplies = getReplies;
// apply like/dislike
const updateReplyReaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { reply_id } = req.params;
    const { type } = req.body;
    const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    if (!user_id)
        return res.status(401).json({ error: 'Unauthorized user!' });
    // Fetch reply and parent comment to determine thread/post context
    const { data: replyData, error: replyError } = yield app_1.supabase
        .from('threadsubcomments')
        .select('id, user_id, content, comment_id, total_likes, total_dislikes, is_deleted')
        .eq('id', reply_id)
        .eq('is_deleted', false)
        .single();
    if (replyError || !replyData) {
        return res.status(404).json({ error: 'Reply not found!' });
    }
    const { data: parentComment, error: commentError } = yield app_1.supabase
        .from('threadcomments')
        .select('thread_id, post_id')
        .eq('id', replyData.comment_id)
        .single();
    if (commentError || !parentComment) {
        return res.status(404).json({ error: 'Parent comment not found!' });
    }
    // Determine if this is a thread or post reply
    let parentType, parentId, parentTitle, parentAuthorId;
    if (parentComment.thread_id) {
        parentType = 'thread';
        parentId = parentComment.thread_id;
        // Fetch thread info
        const { data: threadData } = yield app_1.supabase
            .from('threads')
            .select('title, author_id')
            .eq('id', parentId)
            .single();
        parentTitle = (threadData === null || threadData === void 0 ? void 0 : threadData.title) || 'a thread';
        parentAuthorId = threadData === null || threadData === void 0 ? void 0 : threadData.author_id;
    }
    else if (parentComment.post_id) {
        parentType = 'post';
        parentId = parentComment.post_id;
        // Fetch post info
        const { data: postData } = yield app_1.supabase
            .from('posts')
            .select('content, user_id')
            .eq('id', parentId)
            .single();
        parentTitle = ((_b = postData === null || postData === void 0 ? void 0 : postData.content) === null || _b === void 0 ? void 0 : _b.slice(0, 30)) || 'a post';
        parentAuthorId = postData === null || postData === void 0 ? void 0 : postData.user_id;
    }
    else {
        return res.status(400).json({ error: 'Comment is not linked to a thread or post.' });
    }
    const truncatedTitle = parentTitle.split(' ').length > 3
        ? parentTitle.split(' ').slice(0, 3).join(' ') + '...'
        : parentTitle;
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
    const shouldNotify = replyData.user_id !== user_id;
    let authorProfile = null;
    if (shouldNotify) {
        const { data: profileData } = yield app_1.supabase
            .from('profiles')
            .select('email, first_name, last_name')
            .eq('id', replyData.user_id)
            .single();
        if (profileData)
            authorProfile = profileData;
    }
    let newTotalLikes = (_c = replyData.total_likes) !== null && _c !== void 0 ? _c : 0;
    let newTotalDislikes = (_d = replyData.total_dislikes) !== null && _d !== void 0 ? _d : 0;
    const getReactionDisplayName = (type) => type === 'like' ? 'like' : 'dislike';
    const getContentPreview = (content) => content.split(' ').length > 5
        ? content.split(' ').slice(0, 5).join(' ') + '...'
        : content;
    if (existing) {
        if (existing.type === type) {
            if (type === 'like')
                newTotalLikes = Math.max(0, newTotalLikes - 1);
            if (type === 'dislike')
                newTotalDislikes = Math.max(0, newTotalDislikes - 1);
            yield app_1.supabase
                .from('thread_reactions')
                .delete()
                .eq('id', existing.id);
            yield app_1.supabase
                .from('threadsubcomments')
                .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
                .eq('id', reply_id);
            if (shouldNotify && authorProfile) {
                yield (0, emitNotification_1.sendNotification)({
                    recipientEmail: authorProfile.email,
                    recipientUserId: replyData.user_id,
                    actorUserId: user_id,
                    threadId: parentId,
                    message: `_${getReactionDisplayName(type)}_ reaction was removed from your reply: "${getContentPreview(replyData.content)}" on ${parentType} **${truncatedTitle}**`,
                    type: parentType === 'thread' ? 'reaction_removed' : 'post_reply_reaction_removed',
                    metadata: {
                        reaction_type: type,
                        reply_id,
                        comment_id: replyData.comment_id,
                        [`${parentType}_id`]: parentId,
                        [`${parentType}_title`]: parentTitle,
                        reply_content: replyData.content,
                        actor_user_id: user_id
                    }
                });
            }
            return res.status(200).json({ message: `${type} removed!` });
        }
        // Changing reaction
        if (existing.type === 'like') {
            newTotalLikes = Math.max(0, newTotalLikes - 1);
            newTotalDislikes += 1;
        }
        else {
            newTotalDislikes = Math.max(0, newTotalDislikes - 1);
            newTotalLikes += 1;
        }
        yield app_1.supabase
            .from('thread_reactions')
            .update({ type, updated_by: user_id })
            .eq('id', existing.id);
        yield app_1.supabase
            .from('threadsubcomments')
            .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
            .eq('id', reply_id);
        if (shouldNotify && authorProfile) {
            yield (0, emitNotification_1.sendNotification)({
                recipientEmail: authorProfile.email,
                recipientUserId: replyData.user_id,
                actorUserId: user_id,
                threadId: parentId,
                message: `Reaction changed to _${getReactionDisplayName(type)}_ on your reply: "${getContentPreview(replyData.content)}" on ${parentType} **${truncatedTitle}**`,
                type: parentType === 'thread' ? 'reaction_updated' : 'post_reply_reaction_updated',
                metadata: {
                    previous_reaction_type: existing.type,
                    new_reaction_type: type,
                    reply_id,
                    comment_id: replyData.comment_id,
                    [`${parentType}_id`]: parentId,
                    [`${parentType}_title`]: parentTitle,
                    reply_content: replyData.content,
                    actor_user_id: user_id
                }
            });
        }
        return res.status(200).json({ message: `Reaction updated to ${type}!` });
    }
    else {
        // New reaction
        if (type === 'like')
            newTotalLikes += 1;
        if (type === 'dislike')
            newTotalDislikes += 1;
        yield app_1.supabase
            .from('thread_reactions')
            .insert([{ user_id, target_id: reply_id, target_type: 'reply', type }]);
        yield app_1.supabase
            .from('threadsubcomments')
            .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
            .eq('id', reply_id);
        if (shouldNotify && authorProfile) {
            const soulpointsMap = {
                like: 1,
                dislike: 0
            };
            yield (0, emitNotification_1.sendNotification)({
                recipientEmail: authorProfile.email,
                recipientUserId: replyData.user_id,
                actorUserId: user_id,
                threadId: parentId,
                message: `Received _${getReactionDisplayName(type)}_ on your reply: "${getContentPreview(replyData.content)}" on ${parentType} **${truncatedTitle}**`,
                type: parentType === 'thread' ? 'reaction_added' : 'post_reply_reaction_added',
                metadata: {
                    reaction_type: type,
                    soulpoints: soulpointsMap[type],
                    reply_id,
                    comment_id: replyData.comment_id,
                    [`${parentType}_id`]: parentId,
                    [`${parentType}_title`]: parentTitle,
                    reply_content: replyData.content,
                    actor_user_id: user_id
                }
            });
        }
        return res.status(200).json({ message: `${type} added!` });
    }
});
exports.updateReplyReaction = updateReplyReaction;
