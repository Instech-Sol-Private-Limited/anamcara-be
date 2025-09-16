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
exports.updatePost = exports.deletePost = exports.getPollResults = exports.voteOnPoll = exports.getTrendingPosts = exports.getUserPosts = exports.getPostComments = exports.addReply = exports.addComment = exports.getPosts = exports.createPost = exports.updatePostReaction = void 0;
const app_1 = require("../app");
const emitNotification_1 = require("../sockets/emitNotification");
const posts_service_1 = require("../services/posts.service");
const manageChambers_1 = require("../sockets/manageChambers");
const postFieldMap = {
    like: 'total_likes',
    dislike: 'total_dislikes',
    insightful: 'total_insightfuls',
    heart: 'total_hearts',
    hug: 'total_hugs',
    soul: 'total_souls',
};
const getReactionDisplayName = (reactionType) => {
    const displayNames = {
        'like': 'like',
        'dislike': 'dislike',
        'insightful': 'insightful reaction',
        'heart': 'heart',
        'hug': 'hug',
        'soul': 'soul reaction'
    };
    return displayNames[reactionType] || reactionType;
};
const updatePostReaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    const { postId } = req.params;
    const { type } = req.body;
    const { id: user_id } = req.user;
    if (!user_id || !postFieldMap[type]) {
        return res.status(400).json({ error: 'Invalid user or reaction type.' });
    }
    const { data: existing, error: fetchError } = yield app_1.supabase
        .from('thread_reactions')
        .select('*')
        .eq('user_id', user_id)
        .eq('target_id', postId)
        .eq('target_type', 'post')
        .single();
    if (fetchError && fetchError.code !== 'PGRST116') {
        return res.status(500).json({ error: fetchError.message });
    }
    const { data: postData, error: postError } = yield app_1.supabase
        .from('posts')
        .select('user_id, content, total_likes, total_dislikes, total_insightfuls, total_hearts, total_hugs, total_souls, is_chamber_post, chamber_id')
        .eq('id', postId)
        .single();
    if (postError || !postData) {
        return res.status(404).json({ error: 'Post not found!' });
    }
    const shouldSendNotification = postData.user_id !== user_id;
    let authorProfile = null;
    if (shouldSendNotification) {
        const { data: profileData, error: profileError } = yield app_1.supabase
            .from('profiles')
            .select('email, first_name, last_name')
            .eq('id', postData.user_id)
            .single();
        if (!profileError && profileData) {
            authorProfile = profileData;
        }
    }
    const updates = {
        total_likes: (_a = postData.total_likes) !== null && _a !== void 0 ? _a : 0,
        total_dislikes: (_b = postData.total_dislikes) !== null && _b !== void 0 ? _b : 0,
        total_insightfuls: (_c = postData.total_insightfuls) !== null && _c !== void 0 ? _c : 0,
        total_hearts: (_d = postData.total_hearts) !== null && _d !== void 0 ? _d : 0,
        total_hugs: (_e = postData.total_hugs) !== null && _e !== void 0 ? _e : 0,
        total_souls: (_f = postData.total_souls) !== null && _f !== void 0 ? _f : 0,
    };
    if (existing) {
        if (existing.type === type) {
            const field = postFieldMap[type];
            updates[field] = Math.max(0, updates[field] - 1);
            const { error: deleteError } = yield app_1.supabase
                .from('thread_reactions')
                .delete()
                .eq('id', existing.id);
            if (deleteError)
                return res.status(500).json({ error: deleteError.message });
            const { error: updatePostError } = yield app_1.supabase
                .from('posts')
                .update({ [field]: updates[field] })
                .eq('id', postId);
            if (updatePostError)
                return res.status(500).json({ error: updatePostError.message });
            if (shouldSendNotification && authorProfile) {
                yield (0, emitNotification_1.sendNotification)({
                    recipientEmail: authorProfile.email,
                    recipientUserId: postData.user_id,
                    actorUserId: user_id,
                    threadId: postId,
                    message: `_${getReactionDisplayName(type)}_ reaction was removed from your post.`,
                    type: 'post_reaction_removed',
                    metadata: {
                        reaction_type: type,
                        post_id: postId,
                        actor_user_id: user_id
                    }
                });
            }
            return res.status(200).json({ message: `${type} removed!` });
        }
        const prevField = postFieldMap[existing.type];
        const currentField = postFieldMap[type];
        updates[prevField] = Math.max(0, updates[prevField] - 1);
        updates[currentField] += 1;
        const { error: updateReactionError } = yield app_1.supabase
            .from('thread_reactions')
            .update({ type, updated_by: user_id })
            .eq('id', existing.id);
        if (updateReactionError)
            return res.status(500).json({ error: updateReactionError.message });
        const { error: updatePostError } = yield app_1.supabase
            .from('posts')
            .update({
            [prevField]: updates[prevField],
            [currentField]: updates[currentField],
        })
            .eq('id', postId);
        if (updatePostError)
            return res.status(500).json({ error: updatePostError.message });
        if (shouldSendNotification && authorProfile) {
            yield (0, emitNotification_1.sendNotification)({
                recipientEmail: authorProfile.email,
                recipientUserId: postData.user_id,
                actorUserId: user_id,
                threadId: postId,
                message: `**@someone** changed their reaction to _${getReactionDisplayName(type)}_ on your post.`,
                type: 'post_reaction_updated',
                metadata: {
                    previous_reaction_type: existing.type,
                    new_reaction_type: type,
                    post_id: postId,
                    actor_user_id: user_id
                }
            });
        }
        return res.status(200).json({ message: `Reaction updated to ${type}!` });
    }
    else {
        const field = postFieldMap[type];
        updates[field] += 1;
        const { error: insertError } = yield app_1.supabase
            .from('thread_reactions')
            .insert([{ user_id, target_id: postId, target_type: 'post', type }]);
        if (insertError)
            return res.status(500).json({ error: insertError.message });
        const { error: updatePostError } = yield app_1.supabase
            .from('posts')
            .update({ [field]: updates[field] })
            .eq('id', postId);
        if (updatePostError)
            return res.status(500).json({ error: updatePostError.message });
        if (shouldSendNotification && authorProfile) {
            const soulpointsMap = {
                'like': 2,
                'dislike': 0,
                'insightful': 3,
                'heart': 4,
                'hug': 2,
                'soul': 2
            };
            let soulpoints = soulpointsMap[type] || 0;
            if (postData.is_chamber_post && postData.chamber_id) {
                const { data: chamberData, error: chamberError } = yield app_1.supabase
                    .from('custom_chambers')
                    .select('monetization')
                    .eq('id', postData.chamber_id)
                    .single();
                if (!chamberError && chamberData && ((_g = chamberData.monetization) === null || _g === void 0 ? void 0 : _g.enabled)) {
                    soulpoints *= 2;
                }
            }
            if (soulpoints > 0) {
                const { error: soulpointsError } = yield app_1.supabase.rpc('increment_soulpoints', {
                    p_user_id: postData.user_id,
                    p_points: soulpoints
                });
                if (soulpointsError) {
                    console.error('Error updating soulpoints:', soulpointsError);
                }
            }
            yield (0, emitNotification_1.sendNotification)({
                recipientEmail: authorProfile.email,
                recipientUserId: postData.user_id,
                actorUserId: user_id,
                threadId: postId,
                message: `**@someone** reacted with _${getReactionDisplayName(type)}_ on your post. +${soulpoints} soulpoints added!`,
                type: 'post_reaction_added',
                metadata: {
                    reaction_type: type,
                    post_id: postId,
                    actor_user_id: user_id,
                    soulpoints,
                    is_chamber_post: postData.is_chamber_post,
                    chamber_id: postData.chamber_id
                }
            });
        }
        return res.status(200).json({ message: `${type} added!` });
    }
});
exports.updatePostReaction = updatePostReaction;
const createPost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized: Please login to create a post'
            });
            return;
        }
        const { content, media_url, media_type, feeling_emoji, feeling_label, feeling_type, question_category, question_title, question_description, question_color, poll_options, embedded_items, is_chamber_post = false, chamber_id } = req.body;
        const validationErrors = (0, posts_service_1.validatePostRequest)(req.body);
        if (validationErrors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
            return;
        }
        if (is_chamber_post && chamber_id) {
            const hasPermission = yield (0, posts_service_1.checkChamberPermission)(chamber_id, userId);
            if (!hasPermission) {
                res.status(403).json({
                    success: false,
                    message: 'You do not have permission to post in this chamber'
                });
                return;
            }
        }
        const postType = (0, posts_service_1.determinePostType)({
            poll_options,
            question_category,
            embedded_items
        });
        const postData = {
            user_id: userId,
            content: (content === null || content === void 0 ? void 0 : content.trim()) || null,
            media_url: media_url || null,
            media_type: media_type || null,
            post_type: postType,
            feeling_emoji: feeling_emoji || null,
            feeling_label: feeling_label || null,
            feeling_type: feeling_type || null,
            question_category: question_category || null,
            question_title: question_title || null,
            question_description: question_description || null,
            question_color: question_color || null,
            poll_options: poll_options || null,
            embedded_items: embedded_items || null,
            is_chamber_post,
            chamber_id: is_chamber_post ? chamber_id : null
        };
        const { data: post, error } = yield (0, posts_service_1.createPostInDatabase)(postData);
        if (error) {
            console.error('Database error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create post',
                error: error.message
            });
            return;
        }
        let allocatedPoints = 0;
        let chamberName = '';
        try {
            allocatedPoints = yield (0, posts_service_1.allocateSoulpointsForPost)(userId, is_chamber_post, chamber_id);
            if (is_chamber_post && chamber_id) {
                const { data: chamber } = yield app_1.supabase
                    .from('custom_chambers')
                    .select('name')
                    .eq('id', chamber_id)
                    .single();
                chamberName = (chamber === null || chamber === void 0 ? void 0 : chamber.name) || '';
            }
            yield (0, posts_service_1.sendPostCreationNotification)(userId, post.id, postType, allocatedPoints, is_chamber_post, chamberName);
        }
        catch (notificationError) {
            console.error('Failed to send notification, but post was created:', notificationError);
        }
        if (is_chamber_post && chamber_id) {
            try {
                yield (0, manageChambers_1.notifyChamberMembers)(chamber_id, post.id, userId);
            }
            catch (chamberError) {
                console.error('Failed to notify chamber members:', chamberError);
            }
        }
        res.status(201).json({
            success: true,
            message: 'Post created successfully',
            data: Object.assign(Object.assign({}, post), { allocated_soulpoints: allocatedPoints, is_chamber_post: is_chamber_post, chamber_name: chamberName || undefined })
        });
    }
    catch (error) {
        console.error('Unexpected error in createPost:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});
exports.createPost = createPost;
const getPosts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 10;
        const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (limit > 50) {
            return res.status(400).json({
                success: false,
                message: 'Limit cannot exceed 50 posts per request'
            });
        }
        const { data: allPosts, error } = yield app_1.supabase
            .from('posts')
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
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .range(page * limit, (page + 1) * limit - 1);
        if (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        const postsWithReactions = yield Promise.all(allPosts.map((post) => __awaiter(void 0, void 0, void 0, function* () {
            let userReaction = null;
            let chamberInfo = null;
            if (user_id) {
                const { data: reactionData } = yield app_1.supabase
                    .from('thread_reactions')
                    .select('type')
                    .eq('user_id', user_id)
                    .eq('target_id', post.id)
                    .eq('target_type', 'post')
                    .maybeSingle();
                if (reactionData) {
                    userReaction = reactionData.type;
                }
            }
            if (post.is_chamber_post && post.chamber_id) {
                const { data: chamberData } = yield app_1.supabase
                    .from('custom_chambers')
                    .select('id, name, logo, member_count, color_theme, is_public, monetization')
                    .eq('id', post.chamber_id)
                    .eq('is_active', true)
                    .maybeSingle();
                if (chamberData) {
                    chamberInfo = {
                        id: chamberData.id,
                        name: chamberData.name,
                        logo: chamberData.logo,
                        member_count: chamberData.member_count,
                        color_theme: chamberData.color_theme,
                        is_public: chamberData.is_public,
                        monetization: chamberData.monetization
                    };
                }
            }
            const { data: comments } = yield app_1.supabase
                .from('threadcomments')
                .select('id, post_id, content, is_deleted')
                .eq('post_id', post.id)
                .eq('is_deleted', false);
            const commentIds = (comments === null || comments === void 0 ? void 0 : comments.map(c => c.id)) || [];
            const subcommentsResults = yield Promise.all(commentIds.map(commentId => app_1.supabase
                .from('threadsubcomments')
                .select('id')
                .eq('comment_id', commentId)
                .eq('is_deleted', false)));
            const totalComments = (comments === null || comments === void 0 ? void 0 : comments.length) || 0;
            const totalReplies = subcommentsResults.reduce((sum, result) => { var _a; return sum + (((_a = result.data) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
            return Object.assign(Object.assign({}, post), { user_reaction: userReaction, total_comments: totalComments + totalReplies, chamber: chamberInfo });
        })));
        res.status(200).json({
            success: true,
            data: postsWithReactions,
            pagination: {
                page,
                limit,
                hasMore: (allPosts === null || allPosts === void 0 ? void 0 : allPosts.length) === limit
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching posts'
        });
    }
});
exports.getPosts = getPosts;
const addComment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { postId } = req.params;
        const { content } = req.body;
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Comment content is required'
            });
        }
        const { data, error } = yield app_1.supabase
            .from('threadcomments')
            .insert({
            post_id: postId,
            user_id: userId,
            content: content.trim(),
        })
            .select()
            .single();
        if (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        const { data: postData } = yield app_1.supabase
            .from('posts')
            .select('user_id, content, is_chamber_post, chamber_id')
            .eq('id', postId)
            .single();
        if (postData && postData.user_id !== userId) {
            const { data: authorProfile } = yield app_1.supabase
                .from('profiles')
                .select('email, first_name, last_name')
                .eq('id', postData.user_id)
                .single();
            if (authorProfile) {
                let soulpoints = 2;
                if (postData.is_chamber_post && postData.chamber_id) {
                    const { data: chamberData } = yield app_1.supabase
                        .from('custom_chambers')
                        .select('monetization')
                        .eq('id', postData.chamber_id)
                        .single();
                    if (chamberData && ((_b = chamberData.monetization) === null || _b === void 0 ? void 0 : _b.enabled)) {
                        soulpoints *= 2;
                    }
                }
                const { error: soulpointsError } = yield app_1.supabase.rpc('increment_soulpoints', {
                    p_user_id: postData.user_id,
                    p_points: soulpoints
                });
                if (soulpointsError) {
                    console.error('Error updating soulpoints:', soulpointsError);
                }
                yield (0, emitNotification_1.sendNotification)({
                    recipientEmail: authorProfile.email,
                    recipientUserId: postData.user_id,
                    actorUserId: userId,
                    threadId: postId,
                    message: `**@someone** commented on your post. +${soulpoints} soulpoints added!`,
                    type: 'post_comment_added',
                    metadata: {
                        comment_id: data.id,
                        post_id: postId,
                        actor_user_id: userId,
                        soulpoints: soulpoints,
                        is_chamber_post: postData.is_chamber_post,
                        chamber_id: postData.chamber_id
                    }
                });
            }
        }
        res.status(201).json({
            success: true,
            message: 'Comment added successfully',
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error adding comment'
        });
    }
});
exports.addComment = addComment;
const addReply = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { commentId } = req.params;
        const { content } = req.body;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Please login to reply'
            });
        }
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Reply content is required'
            });
        }
        // Get user profile for reply
        const { data: userProfile } = yield app_1.supabase
            .from('profiles')
            .select('first_name, last_name, avatar_url')
            .eq('id', userId)
            .single();
        const { data, error } = yield app_1.supabase
            .from('threadsubcomments')
            .insert({
            comment_id: commentId,
            user_id: userId,
            content: content.trim(),
        })
            .select()
            .single();
        if (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        // Get comment and post info for notification
        const { data: commentData } = yield app_1.supabase
            .from('threadcomments')
            .select('user_id, post_id')
            .eq('id', commentId)
            .single();
        if (commentData) {
            // Send notification to comment author
            if (commentData.user_id !== userId) {
                const { data: commentAuthorProfile } = yield app_1.supabase
                    .from('profiles')
                    .select('email, first_name, last_name')
                    .eq('id', commentData.user_id)
                    .single();
                if (commentAuthorProfile) {
                    yield (0, emitNotification_1.sendNotification)({
                        recipientEmail: commentAuthorProfile.email,
                        recipientUserId: commentData.user_id,
                        actorUserId: userId,
                        threadId: commentData.post_id,
                        message: `**@someone** replied to your comment. +1 soulpoint added!`,
                        type: 'post_reply_added',
                        metadata: {
                            reply_id: data.id,
                            comment_id: commentId,
                            post_id: commentData.post_id,
                            actor_user_id: userId,
                            soulpoints: 1
                        }
                    });
                }
            }
            // Also send notification to post author if different from comment author
            const { data: postData } = yield app_1.supabase
                .from('posts')
                .select('user_id')
                .eq('id', commentData.post_id)
                .single();
            if (postData && postData.user_id !== userId && postData.user_id !== commentData.user_id) {
                const { data: postAuthorProfile } = yield app_1.supabase
                    .from('profiles')
                    .select('email, first_name, last_name')
                    .eq('id', postData.user_id)
                    .single();
                if (postAuthorProfile) {
                    yield (0, emitNotification_1.sendNotification)({
                        recipientEmail: postAuthorProfile.email,
                        recipientUserId: postData.user_id,
                        actorUserId: userId,
                        threadId: commentData.post_id,
                        message: `**@someone** replied to a comment on your post.`,
                        type: 'post_reply_added',
                        metadata: {
                            reply_id: data.id,
                            comment_id: commentId,
                            post_id: commentData.post_id,
                            actor_user_id: userId
                        }
                    });
                }
            }
        }
        res.status(201).json({
            success: true,
            message: 'Reply added successfully',
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error adding reply'
        });
    }
});
exports.addReply = addReply;
const getPostComments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { postId } = req.params;
        const { data: comments, error } = yield app_1.supabase
            .from('threadcomments')
            .select('*')
            .eq('post_id', postId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true });
        if (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        // Get replies for each comment
        const commentsWithReplies = yield Promise.all(comments.map((comment) => __awaiter(void 0, void 0, void 0, function* () {
            const { data: replies } = yield app_1.supabase
                .from('threadsubcomments')
                .select('*')
                .eq('comment_id', comment.id)
                .eq('is_deleted', false)
                .order('created_at', { ascending: true });
            return Object.assign(Object.assign({}, comment), { replies: replies || [] });
        })));
        res.status(200).json({
            success: true,
            data: commentsWithReplies
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching comments'
        });
    }
});
exports.getPostComments = getPostComments;
const getUserPosts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { userId } = req.params;
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 10;
        const current_user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (limit > 50) {
            return res.status(400).json({
                success: false,
                message: 'Limit cannot exceed 50 posts per request'
            });
        }
        const { data: posts, error } = yield app_1.supabase
            .from('posts')
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
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .range(page * limit, (page + 1) * limit - 1);
        if (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        // Add user reactions and comment counts
        const postsWithReactions = yield Promise.all(posts.map((post) => __awaiter(void 0, void 0, void 0, function* () {
            let userReaction = null;
            if (current_user_id) {
                const { data: reactionData } = yield app_1.supabase
                    .from('thread_reactions')
                    .select('type')
                    .eq('user_id', current_user_id)
                    .eq('post_id', post.id)
                    .eq('target_type', 'post')
                    .maybeSingle();
                if (reactionData) {
                    userReaction = reactionData.type;
                }
            }
            // Get comment count
            const { data: comments } = yield app_1.supabase
                .from('threadcomments')
                .select('id, post_id, content, is_deleted')
                .eq('post_id', post.id)
                .eq('is_deleted', false);
            const commentIds = (comments === null || comments === void 0 ? void 0 : comments.map(c => c.id)) || [];
            const subcommentsResults = yield Promise.all(commentIds.map(commentId => app_1.supabase
                .from('threadsubcomments')
                .select('id')
                .eq('comment_id', commentId)
                .eq('is_deleted', false)));
            const totalComments = (comments === null || comments === void 0 ? void 0 : comments.length) || 0;
            const totalReplies = subcommentsResults.reduce((sum, result) => { var _a; return sum + (((_a = result.data) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
            return Object.assign(Object.assign({}, post), { user_reaction: userReaction, total_comments: totalComments + totalReplies });
        })));
        res.status(200).json({
            success: true,
            data: postsWithReactions,
            pagination: {
                page,
                limit,
                hasMore: (posts === null || posts === void 0 ? void 0 : posts.length) === limit
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching user posts'
        });
    }
});
exports.getUserPosts = getUserPosts;
const getTrendingPosts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const limit = parseInt(req.query.limit) || 10;
        if (limit > 50) {
            return res.status(400).json({
                success: false,
                message: 'Limit cannot exceed 50 posts per request'
            });
        }
        const { data, error } = yield app_1.supabase
            .from('posts')
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
            .eq('is_active', true)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('total_likes', { ascending: false })
            .order('total_comments', { ascending: false })
            .limit(limit);
        if (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        res.status(200).json({
            success: true,
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching trending posts'
        });
    }
});
exports.getTrendingPosts = getTrendingPosts;
const voteOnPoll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { postId } = req.params;
        const { optionIndex } = req.body;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Please login to vote'
            });
        }
        if (typeof optionIndex !== 'number' || optionIndex < 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid option index is required'
            });
        }
        // Verify it's a poll post
        const { data: post } = yield app_1.supabase
            .from('posts')
            .select('post_type, poll_options, user_id')
            .eq('id', postId)
            .single();
        if (!post || post.post_type !== 'poll') {
            return res.status(400).json({
                success: false,
                message: 'This is not a poll post'
            });
        }
        if (!post.poll_options || optionIndex >= post.poll_options.length) {
            return res.status(400).json({
                success: false,
                message: 'Invalid option index'
            });
        }
        // Check if user already voted
        const { data: existingVote } = yield app_1.supabase
            .from('poll_votes')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', userId)
            .single();
        if (existingVote) {
            // Update existing vote
            const { data, error } = yield app_1.supabase
                .from('poll_votes')
                .update({ option_index: optionIndex })
                .eq('post_id', postId)
                .eq('user_id', userId)
                .select()
                .single();
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
            res.status(200).json({
                success: true,
                message: 'Vote updated successfully',
                data
            });
        }
        else {
            // Insert new vote
            const { data, error } = yield app_1.supabase
                .from('poll_votes')
                .insert({
                post_id: postId,
                user_id: userId,
                option_index: optionIndex
            })
                .select()
                .single();
            if (error) {
                return res.status(500).json({
                    success: false,
                    message: error.message
                });
            }
            // Send notification to poll creator
            if (post.user_id !== userId) {
                const { data: authorProfile } = yield app_1.supabase
                    .from('profiles')
                    .select('email')
                    .eq('id', post.user_id)
                    .single();
                if (authorProfile) {
                    yield (0, emitNotification_1.sendNotification)({
                        recipientEmail: authorProfile.email,
                        recipientUserId: post.user_id,
                        actorUserId: userId,
                        threadId: postId,
                        message: `**@someone** voted on your poll. +1 soulpoint added!`,
                        type: 'poll_vote_added',
                        metadata: {
                            post_id: postId,
                            actor_user_id: userId,
                            option_index: optionIndex,
                            soulpoints: 1
                        }
                    });
                }
            }
            res.status(201).json({
                success: true,
                message: 'Vote recorded successfully',
                data
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error voting on poll'
        });
    }
});
exports.voteOnPoll = voteOnPoll;
const getPollResults = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { postId } = req.params;
        // Verify it's a poll post
        const { data: post } = yield app_1.supabase
            .from('posts')
            .select('post_type, poll_options')
            .eq('id', postId)
            .single();
        if (!post || post.post_type !== 'poll') {
            return res.status(400).json({
                success: false,
                message: 'This is not a poll post'
            });
        }
        const { data, error } = yield app_1.supabase
            .from('poll_votes')
            .select('option_index')
            .eq('post_id', postId);
        if (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        // Count votes for each option
        const voteCounts = {};
        data === null || data === void 0 ? void 0 : data.forEach((vote) => {
            voteCounts[vote.option_index] = (voteCounts[vote.option_index] || 0) + 1;
        });
        const totalVotes = (data === null || data === void 0 ? void 0 : data.length) || 0;
        // Format results with percentages
        const results = post.poll_options.map((option, index) => ({
            option,
            votes: voteCounts[index] || 0,
            percentage: totalVotes > 0 ? Math.round(((voteCounts[index] || 0) / totalVotes) * 100) : 0
        }));
        res.status(200).json({
            success: true,
            data: {
                results,
                totalVotes
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching poll results'
        });
    }
});
exports.getPollResults = getPollResults;
const deletePost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { postId } = req.params;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Please login to delete posts'
            });
        }
        const { error } = yield app_1.supabase
            .from('posts')
            .update({ is_active: false })
            .eq('id', postId)
            .eq('user_id', userId);
        if (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        res.status(200).json({
            success: true,
            message: 'Post deleted successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error deleting post'
        });
    }
});
exports.deletePost = deletePost;
const updatePost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { postId } = req.params;
        const { content, mediaUrl, mediaType } = req.body;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Please login to update posts'
            });
        }
        if (!content && !mediaUrl) {
            return res.status(400).json({
                success: false,
                message: 'Post content or media is required'
            });
        }
        const { data, error } = yield app_1.supabase
            .from('posts')
            .update({
            content,
            media_url: mediaUrl,
            media_type: mediaType,
            updated_at: new Date().toISOString()
        })
            .eq('id', postId)
            .eq('user_id', userId)
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
        if (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Post not found or you do not have permission to update it'
            });
        }
        res.status(200).json({
            success: true,
            message: 'Post updated successfully',
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating post'
        });
    }
});
exports.updatePost = updatePost;
