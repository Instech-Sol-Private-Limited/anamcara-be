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
const postFieldMap = {
    like: 'total_likes',
    dislike: 'total_dislikes',
    insightful: 'total_insightfuls',
    heart: 'total_hearts',
    hug: 'total_hugs',
    soul: 'total_souls',
};
// Toggle post reaction (using thread_reactions table with post_id)
const updatePostReaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const { postId } = req.params;
    const { type } = req.body;
    const { id: user_id } = req.user;
    if (!user_id || !postFieldMap[type]) {
        return res.status(400).json({ error: 'Invalid user or reaction type.' });
    }
    // Check for existing reaction
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
    // Get post and author
    const { data: postData, error: postError } = yield app_1.supabase
        .from('posts')
        .select('user_id, content, total_likes, total_dislikes, total_insightfuls, total_hearts, total_hugs, total_souls')
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
    // Prepare update fields
    const updates = {
        total_likes: (_a = postData.total_likes) !== null && _a !== void 0 ? _a : 0,
        total_dislikes: (_b = postData.total_dislikes) !== null && _b !== void 0 ? _b : 0,
        total_insightfuls: (_c = postData.total_insightfuls) !== null && _c !== void 0 ? _c : 0,
        total_hearts: (_d = postData.total_hearts) !== null && _d !== void 0 ? _d : 0,
        total_hugs: (_e = postData.total_hugs) !== null && _e !== void 0 ? _e : 0,
        total_souls: (_f = postData.total_souls) !== null && _f !== void 0 ? _f : 0,
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
    if (existing) {
        if (existing.type === type) {
            // Remove reaction
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
        // Change reaction
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
        // Add new reaction
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
            // Soulpoints logic
            const soulpointsMap = {
                'like': 2,
                'dislike': 0,
                'insightful': 3,
                'heart': 4,
                'hug': 2,
                'soul': 2
            };
            const soulpoints = soulpointsMap[type] || 0;
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
                    soulpoints
                }
            });
        }
        return res.status(200).json({ message: `${type} added!` });
    }
});
exports.updatePostReaction = updatePostReaction;
// Create a new post
const createPost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Please login to create a post'
            });
        }
        const { content, mediaUrl, mediaType, feelingEmoji, feelingLabel, feelingType, questionCategory, questionTitle, questionDescription, questionColor, pollOptions } = req.body;
        // Validate required fields based on post type
        if (pollOptions && pollOptions.length > 0) {
            if (!Array.isArray(pollOptions) || pollOptions.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Poll must have at least 2 options'
                });
            }
        }
        else if (questionCategory) {
            if (!questionTitle) {
                return res.status(400).json({
                    success: false,
                    message: 'Question title is required for question posts'
                });
            }
        }
        else if (!content && !mediaUrl) {
            return res.status(400).json({
                success: false,
                message: 'Post content or media is required'
            });
        }
        // Determine post type
        let postType = 'regular';
        if (pollOptions && pollOptions.length > 0) {
            postType = 'poll';
        }
        else if (questionCategory) {
            postType = 'question';
        }
        const { data, error } = yield app_1.supabase
            .from('posts')
            .insert({
            user_id: userId,
            content,
            media_url: mediaUrl,
            media_type: mediaType,
            post_type: postType,
            feeling_emoji: feelingEmoji,
            feeling_label: feelingLabel,
            feeling_type: feelingType,
            question_category: questionCategory,
            question_title: questionTitle,
            question_description: questionDescription,
            question_color: questionColor,
            poll_options: pollOptions
        })
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
        // Send notification for post creation
        const { data: profileData } = yield app_1.supabase
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .single();
        if (profileData) {
            yield (0, emitNotification_1.sendNotification)({
                recipientEmail: profileData.email,
                recipientUserId: userId,
                actorUserId: null,
                threadId: data.id,
                message: 'Post created successfully! +5 soulpoints added to your profile',
                type: 'post_creation',
                metadata: {
                    soulpoints: 5,
                    post_id: data.id,
                    post_type: postType
                }
            });
        }
        res.status(201).json({
            success: true,
            message: 'Post created successfully',
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating post'
        });
    }
});
exports.createPost = createPost;
// Get posts with pagination
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
        // Add user reactions and comment counts
        const postsWithReactions = yield Promise.all(allPosts.map((post) => __awaiter(void 0, void 0, void 0, function* () {
            let userReaction = null;
            if (user_id) {
                const { data: reactionData } = yield app_1.supabase
                    .from('thread_reactions')
                    .select('type')
                    .eq('user_id', user_id)
                    .eq('post_id', post.id)
                    .eq('target_type', 'post')
                    .maybeSingle();
                if (reactionData) {
                    userReaction = reactionData.type;
                }
            }
            // Get comment count using threadcomments table with post_id
            const { data: comments } = yield app_1.supabase
                .from('threadcomments')
                .select('id, post_id, content, is_deleted')
                .eq('post_id', post.id)
                .eq('is_deleted', false);
            const commentIds = (comments === null || comments === void 0 ? void 0 : comments.map(c => c.id)) || [];
            // Get subcomments/replies count
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
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { postId } = req.params;
        const { content } = req.body;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Please login to comment'
            });
        }
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Comment content is required'
            });
        }
        // Get user profile for comment
        const { data: userProfile } = yield app_1.supabase
            .from('profiles')
            .select('first_name, last_name, avatar_url')
            .eq('id', userId)
            .single();
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
        // Send notification to post author
        const { data: postData } = yield app_1.supabase
            .from('posts')
            .select('user_id, content')
            .eq('id', postId)
            .single();
        if (postData && postData.user_id !== userId) {
            const { data: authorProfile } = yield app_1.supabase
                .from('profiles')
                .select('email, first_name, last_name')
                .eq('id', postData.user_id)
                .single();
            if (authorProfile) {
                yield (0, emitNotification_1.sendNotification)({
                    recipientEmail: authorProfile.email,
                    recipientUserId: postData.user_id,
                    actorUserId: userId,
                    threadId: postId,
                    message: `**@someone** commented on your post. +2 soulpoints added!`,
                    type: 'post_comment_added',
                    metadata: {
                        comment_id: data.id,
                        post_id: postId,
                        actor_user_id: userId,
                        soulpoints: 2
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
// Get post comments with nested replies (using threadcomments and threadsubcomments)
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
// Get posts by user
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
// Get trending posts
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
// Vote on poll
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
// Get poll results
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
// Delete post (soft delete)
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
// Update post
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
