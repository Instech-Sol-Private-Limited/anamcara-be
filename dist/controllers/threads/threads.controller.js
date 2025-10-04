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
exports.toggleThreadStatus = exports.getThreadsByUserId = exports.updateReaction = exports.getAllThreads = exports.getThreadDetails = exports.updateThread = exports.deleteThread = exports.createThread = void 0;
const app_1 = require("../../app");
const emitNotification_1 = require("../../sockets/emitNotification");
const fieldMap = {
    like: 'total_likes',
    dislike: 'total_dislikes',
    insightful: 'total_insightfuls',
    heart: 'total_hearts',
    hug: 'total_hugs',
    soul: 'total_souls',
};
// add new thread
const createThread = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { title, description, imgs = [], category_id, keywords = [], whisper_mode = false, disclaimers = [] } = req.body;
        const { id: author_id, first_name, last_name, email } = req.user;
        const requiredFields = {
            title,
            description,
            category_id,
            author_id,
            author_name: first_name,
        };
        for (const [key, value] of Object.entries(requiredFields)) {
            if (!value) {
                const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                return res.status(400).json({ error: `${formattedKey} is required!` });
            }
        }
        if (disclaimers && !Array.isArray(disclaimers)) {
            return res.status(400).json({ error: 'Disclaimers must be an array' });
        }
        const enabledDisclaimers = disclaimers
            ? disclaimers.filter((d) => d.enabled === true)
            : null;
        const { data: categoryData, error: categoryError } = yield app_1.supabase
            .from('threadcategory')
            .select('category_name')
            .eq('id', category_id)
            .single();
        if (categoryError || !categoryData) {
            return res.status(400).json({ error: 'Invalid Category Id. No matching category found.' });
        }
        const { category_name } = categoryData;
        const { data, error } = yield app_1.supabase
            .from('threads')
            .insert([{
                title,
                description,
                imgs,
                category_id,
                category_name,
                author_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
                author_id,
                keywords,
                whisper_mode,
                disclaimers: enabledDisclaimers
            }])
            .select();
        if (error) {
            console.error('Supabase insert error:', error);
            return res.status(500).json({
                error: error.message || 'Unknown error occurred while creating thread.',
                details: error.details || null,
                hint: error.hint || null,
            });
        }
        if (!data || data.length === 0) {
            return res.status(500).json({ error: 'Thread creation failed. No data returned.' });
        }
        const threadId = data[0].id;
        yield (0, emitNotification_1.sendNotification)({
            recipientEmail: email,
            recipientUserId: author_id,
            actorUserId: null,
            threadId: threadId,
            message: 'Thread created successfully! +10 soulpoints added to your profile',
            type: 'thread_creation',
            metadata: {
                soulpoints: 10,
                thread_id: threadId,
                thread_title: title
            }
        });
        return res.status(201).json({
            message: 'Thread created successfully!',
        });
    }
    catch (err) {
        console.error('Unexpected error in createThread:', err);
        return res.status(500).json({
            error: 'Internal server error while creating thread.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.createThread = createThread;
// delete thread
const deleteThread = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { thread_id } = req.params;
        const { id: user_id, role } = req.user;
        const { data: thread, error: fetchError } = yield app_1.supabase
            .from('threads')
            .select('id, author_id')
            .eq('id', thread_id)
            .eq('is_deleted', false)
            .single();
        if (fetchError || !thread) {
            return res.status(404).json({ error: 'Thread not found!' });
        }
        const isAuthor = thread.author_id === user_id;
        const isSuperadmin = role === 'superadmin';
        if (!isAuthor && !isSuperadmin) {
            return res.status(403).json({ error: 'Permission denied!' });
        }
        const { error: deleteError } = yield app_1.supabase
            .from('threads')
            .update({
            is_deleted: true,
        })
            .eq('id', thread_id);
        if (deleteError) {
            return res.status(500).json({ error: deleteError.message });
        }
        return res.status(200).json({ message: 'Thread deleted successfully!' });
    }
    catch (err) {
        console.error('Unexpected error in deleteThread:', err);
        return res.status(500).json({
            error: 'Internal server error while deleting thread.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.deleteThread = deleteThread;
// update thread
const updateThread = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { thread_id } = req.params;
        const { title, description, imgs = [], category_id, keywords = [], whisper_mode = false, } = req.body;
        const { id: author_id, first_name, last_name, role } = req.user;
        const { data: existingThread, error: threadError } = yield app_1.supabase
            .from('threads')
            .select('*')
            .eq('id', thread_id)
            .eq('is_deleted', false)
            .single();
        if (threadError || !existingThread) {
            return res.status(404).json({ error: 'Thread not found!' });
        }
        const isAuthor = existingThread.author_id === author_id;
        const isSuperadmin = role === 'superadmin';
        if (!isAuthor && !isSuperadmin) {
            return res.status(403).json({ error: 'Permission denied!' });
        }
        const requiredFields = {
            title,
            description,
            category_id,
            author_id,
            author_name: first_name,
        };
        for (const [key, value] of Object.entries(requiredFields)) {
            if (!value) {
                const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                return res.status(400).json({ error: `${formattedKey} is required!` });
            }
        }
        const { data: categoryData, error: categoryError } = yield app_1.supabase
            .from('threadcategory')
            .select('category_name')
            .eq('id', category_id)
            .single();
        if (categoryError || !categoryData) {
            return res.status(400).json({ error: 'Invalid Category Id. No matching category found.' });
        }
        const { category_name } = categoryData;
        const { error: updateError } = yield app_1.supabase
            .from('threads')
            .update({
            title,
            description,
            imgs,
            category_id,
            category_name,
            author_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
            author_id,
            keywords,
            whisper_mode,
            updated_by: author_id,
            is_edited: true
        })
            .eq('id', thread_id);
        if (updateError) {
            console.error('Supabase update error:', updateError);
            return res.status(500).json({
                error: updateError.message || 'Unknown error occurred while updating thread.',
                details: updateError.details || null,
                hint: updateError.hint || null,
            });
        }
        return res.status(200).json({
            message: 'Thread updated successfully!',
        });
    }
    catch (err) {
        console.error('Unexpected error in updateThread:', err);
        return res.status(500).json({
            error: 'Internal server error while updating thread.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.updateThread = updateThread;
// get thread details
const getThreadDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { thread_id } = req.params;
        const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!thread_id) {
            return res.status(400).json({ error: 'Thread ID is required in the request parameters.' });
        }
        const { data: thread, error: threadError } = yield app_1.supabase
            .from('threads')
            .select(`
        *,
        profiles!inner(avatar_url)
      `)
            .eq('id', thread_id)
            .eq('is_active', true)
            .eq('is_deleted', false)
            .maybeSingle();
        if (threadError || !thread) {
            return res.status(404).json({ error: 'Thread not found!' });
        }
        let userReaction = null;
        if (user_id) {
            const { data: reactionData, error: reactionError } = yield app_1.supabase
                .from('thread_reactions')
                .select('type')
                .eq('user_id', user_id)
                .eq('target_type', 'thread')
                .eq('target_id', thread_id)
                .maybeSingle();
            if (!reactionError && reactionData) {
                userReaction = reactionData.type;
            }
        }
        const { data: comments, error: commentsError } = yield app_1.supabase
            .from('threadcomments')
            .select('id, thread_id, content, is_deleted')
            .eq('thread_id', thread_id)
            .eq('is_deleted', false);
        if (commentsError) {
            return res.status(500).json({ error: 'Error fetching comments' });
        }
        const commentIds = (comments === null || comments === void 0 ? void 0 : comments.map(c => c.id)) || [];
        const subcommentsPromises = commentIds.map(commentId => app_1.supabase
            .from('threadsubcomments')
            .select('id, comment_id, is_deleted')
            .eq('comment_id', commentId)
            .eq('is_deleted', false));
        const subcommentsResults = yield Promise.all(subcommentsPromises);
        let total_subcomments = 0;
        for (const result of subcommentsResults) {
            const { data: subcomments, error: subcommentsError } = result;
            if (subcommentsError) {
                return res.status(500).json({ error: 'Error fetching replies' });
            }
            total_subcomments += (subcomments === null || subcomments === void 0 ? void 0 : subcomments.length) || 0;
        }
        return res.json(Object.assign(Object.assign({}, thread), { user_reaction: userReaction, total_comments: ((comments === null || comments === void 0 ? void 0 : comments.length) || 0) + total_subcomments }));
    }
    catch (err) {
        console.error('getThreadDetails error:', err);
        return res.status(500).json({ error: 'Something went wrong!' });
    }
});
exports.getThreadDetails = getThreadDetails;
// get all threads
const getAllThreads = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    try {
        let spammedThreadIds = [];
        if (user_id) {
            const { data: spammed, error: spamError } = yield app_1.supabase
                .from('threads_spam')
                .select('thread_id')
                .eq('user_id', user_id);
            if (spamError) {
                console.error('Error fetching spammed threads:', spamError);
                return res.status(500).json({ error: 'Failed to fetch spammed threads.' });
            }
            spammedThreadIds = (spammed === null || spammed === void 0 ? void 0 : spammed.map(item => item.thread_id)) || [];
        }
        const { data: allThreads, error: threadError } = yield app_1.supabase
            .from('threads')
            .select(`
        *,
        profiles!inner(avatar_url)
      `)
            .eq('is_active', true)
            .eq('is_deleted', false)
            .order('publish_date', { ascending: false });
        if (threadError)
            return res.status(500).json({ error: threadError.message });
        const filteredThreads = allThreads.filter(thread => !spammedThreadIds.includes(thread.id));
        const paginatedThreads = filteredThreads.slice(offset, offset + limit);
        const threadsWithReactions = yield Promise.all(paginatedThreads.map((thread) => __awaiter(void 0, void 0, void 0, function* () {
            let userReaction = null;
            if (user_id) {
                const { data: reactionData } = yield app_1.supabase
                    .from('thread_reactions')
                    .select('type')
                    .eq('user_id', user_id)
                    .eq('target_type', 'thread')
                    .eq('target_id', thread.id)
                    .maybeSingle();
                if (reactionData) {
                    userReaction = reactionData.type;
                }
            }
            const { data: comments } = yield app_1.supabase
                .from('threadcomments')
                .select('id, thread_id, content, is_deleted')
                .eq('thread_id', thread.id)
                .eq('is_deleted', false);
            const commentIds = (comments === null || comments === void 0 ? void 0 : comments.map(c => c.id)) || [];
            const subcommentsResults = yield Promise.all(commentIds.map(commentId => app_1.supabase
                .from('threadsubcomments')
                .select('id')
                .eq('comment_id', commentId)
                .eq('is_deleted', false)));
            const totalComments = (comments === null || comments === void 0 ? void 0 : comments.length) || 0;
            const totalReplies = subcommentsResults.reduce((sum, result) => { var _a; return sum + (((_a = result.data) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
            return Object.assign(Object.assign({}, thread), { user_reaction: userReaction, total_comments: totalComments + totalReplies });
        })));
        return res.json(threadsWithReactions);
    }
    catch (err) {
        console.error('getAllThreads error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});
exports.getAllThreads = getAllThreads;
// apply like/dislike
const updateReaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const { thread_id } = req.params;
    const { type } = req.body;
    const { id: user_id } = req.user;
    if (!user_id || !fieldMap[type]) {
        return res.status(400).json({ error: 'Invalid user or reaction type.' });
    }
    const { data: existing, error: fetchError } = yield app_1.supabase
        .from('thread_reactions')
        .select('*')
        .eq('user_id', user_id)
        .eq('target_id', thread_id)
        .eq('target_type', 'thread')
        .single();
    if (fetchError && fetchError.code !== 'PGRST116') {
        return res.status(500).json({ error: fetchError.message });
    }
    const { data: threadData, error: threadError } = yield app_1.supabase
        .from('threads')
        .select('total_likes, total_dislikes, total_insightfuls, total_hearts, total_hugs, total_souls, author_id, title')
        .eq('id', thread_id)
        .eq('is_deleted', false)
        .single();
    if (threadError || !threadData) {
        return res.status(404).json({ error: 'Thread not found!' });
    }
    const shouldSendNotification = threadData.author_id !== user_id;
    let authorProfile = null;
    if (shouldSendNotification) {
        const { data: profileData, error: profileError } = yield app_1.supabase
            .from('profiles')
            .select('email, first_name, last_name')
            .eq('id', threadData.author_id)
            .single();
        if (profileError) {
            console.error('Error fetching author profile:', profileError);
        }
        else {
            authorProfile = profileData;
        }
    }
    const updates = {
        total_likes: (_a = threadData.total_likes) !== null && _a !== void 0 ? _a : 0,
        total_dislikes: (_b = threadData.total_dislikes) !== null && _b !== void 0 ? _b : 0,
        total_insightfuls: (_c = threadData.total_insightfuls) !== null && _c !== void 0 ? _c : 0,
        total_hearts: (_d = threadData.total_hearts) !== null && _d !== void 0 ? _d : 0,
        total_hugs: (_e = threadData.total_hugs) !== null && _e !== void 0 ? _e : 0,
        total_souls: (_f = threadData.total_souls) !== null && _f !== void 0 ? _f : 0,
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
            const field = fieldMap[type];
            updates[field] = Math.max(0, updates[field] - 1);
            const { error: deleteError } = yield app_1.supabase
                .from('thread_reactions')
                .delete()
                .eq('id', existing.id);
            if (deleteError)
                return res.status(500).json({ error: deleteError.message });
            const { error: updateThreadError } = yield app_1.supabase
                .from('threads')
                .update({ [field]: updates[field] })
                .eq('id', thread_id);
            if (updateThreadError)
                return res.status(500).json({ error: updateThreadError.message });
            if (shouldSendNotification && authorProfile) {
                yield (0, emitNotification_1.sendNotification)({
                    recipientEmail: authorProfile.email,
                    recipientUserId: threadData.author_id,
                    actorUserId: user_id,
                    threadId: thread_id,
                    message: `_${getReactionDisplayName(type)}_ reaction was removed from your thread **${threadData.title.split(' ').length > 3
                        ? threadData.title.split(' ').slice(0, 3).join(' ') + '...'
                        : threadData.title}**`,
                    type: 'reaction_removed',
                    metadata: {
                        reaction_type: type,
                        thread_id: thread_id,
                        thread_title: threadData.title,
                        actor_user_id: user_id
                    }
                });
            }
            return res.status(200).json({ message: `${type} removed!` });
        }
        const prevField = fieldMap[existing.type];
        const currentField = fieldMap[type];
        updates[prevField] = Math.max(0, updates[prevField] - 1);
        updates[currentField] += 1;
        const { error: updateReactionError } = yield app_1.supabase
            .from('thread_reactions')
            .update({ type, updated_by: user_id })
            .eq('id', existing.id);
        if (updateReactionError)
            return res.status(500).json({ error: updateReactionError.message });
        const { error: updateThreadError } = yield app_1.supabase
            .from('threads')
            .update({
            [prevField]: updates[prevField],
            [currentField]: updates[currentField],
        })
            .eq('id', thread_id);
        if (updateThreadError)
            return res.status(500).json({ error: updateThreadError.message });
        if (shouldSendNotification && authorProfile) {
            yield (0, emitNotification_1.sendNotification)({
                recipientEmail: authorProfile.email,
                recipientUserId: threadData.author_id,
                actorUserId: user_id,
                threadId: thread_id,
                message: `**@someone** changed their reaction to _${getReactionDisplayName(type)}_ on your thread **${threadData.title.split(' ').length > 3
                    ? threadData.title.split(' ').slice(0, 3).join(' ') + '...'
                    : threadData.title}**`,
                type: 'reaction_updated',
                metadata: {
                    previous_reaction_type: existing.type,
                    new_reaction_type: type,
                    thread_id: thread_id,
                    thread_title: threadData.title,
                    actor_user_id: user_id
                }
            });
        }
        return res.status(200).json({ message: `Reaction updated to ${type}!` });
    }
    else {
        const field = fieldMap[type];
        updates[field] += 1;
        const { error: insertError } = yield app_1.supabase
            .from('thread_reactions')
            .insert([{ user_id, target_id: thread_id, target_type: 'thread', type }]);
        if (insertError)
            return res.status(500).json({ error: insertError.message });
        const { error: updateThreadError } = yield app_1.supabase
            .from('threads')
            .update({ [field]: updates[field] })
            .eq('id', thread_id);
        if (updateThreadError)
            return res.status(500).json({ error: updateThreadError.message });
        if (shouldSendNotification && authorProfile) {
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
                recipientUserId: threadData.author_id,
                actorUserId: user_id,
                threadId: thread_id,
                message: `Received _${getReactionDisplayName(type)}_ reaction on your thread **${threadData.title.split(' ').length > 3
                    ? threadData.title.split(' ').slice(0, 3).join(' ') + '...'
                    : threadData.title}**`,
                type: 'reaction_added',
                metadata: {
                    reaction_type: type,
                    soulpoints: soulpoints,
                    thread_id: thread_id,
                    thread_title: threadData.title,
                    actor_user_id: user_id
                }
            });
        }
        return res.status(200).json({ message: `${type} added!` });
    }
});
exports.updateReaction = updateReaction;
// get profile threads
const getThreadsByUserId = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { user_id } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const current_user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!user_id) {
            return res.status(400).json({ error: 'User ID is required in the request parameters.' });
        }
        const { data: threads, error } = yield app_1.supabase
            .from('threads')
            .select(`
        *,
        profiles!inner(avatar_url)
      `)
            .eq('author_id', user_id)
            .eq('is_active', true)
            .eq('is_deleted', false)
            .order('publish_date', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error)
            return res.status(500).json({ error: error.message });
        const threadsWithReactions = yield Promise.all(threads.map((thread) => __awaiter(void 0, void 0, void 0, function* () {
            let userReaction = null;
            if (current_user_id) {
                const { data: reactionData, error: reactionError } = yield app_1.supabase
                    .from('thread_reactions')
                    .select('type')
                    .eq('user_id', current_user_id)
                    .eq('target_type', 'thread')
                    .eq('target_id', thread.id)
                    .maybeSingle();
                if (!reactionError && reactionData) {
                    userReaction = reactionData.type;
                }
            }
            const { data: comments } = yield app_1.supabase
                .from('threadcomments')
                .select('id, thread_id, content, is_deleted')
                .eq('thread_id', thread.id)
                .eq('is_deleted', false);
            const commentIds = (comments === null || comments === void 0 ? void 0 : comments.map(c => c.id)) || [];
            const subcommentsResults = yield Promise.all(commentIds.map(commentId => app_1.supabase
                .from('threadsubcomments')
                .select('id')
                .eq('comment_id', commentId)
                .eq('is_deleted', false)));
            const totalComments = (comments === null || comments === void 0 ? void 0 : comments.length) || 0;
            const totalReplies = subcommentsResults.reduce((sum, result) => { var _a; return sum + (((_a = result.data) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
            return Object.assign(Object.assign({}, thread), { user_reaction: userReaction, total_comments: totalComments + totalReplies });
        })));
        return res.status(200).json({
            threads: threadsWithReactions,
            pagination: {
                limit,
                offset,
                count: threadsWithReactions.length
            }
        });
    }
    catch (err) {
        console.error('Unexpected error in getThreadsByUserId:', err);
        return res.status(500).json({
            error: 'Internal server error while fetching threads.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.getThreadsByUserId = getThreadsByUserId;
const toggleThreadStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { thread_id } = req.params;
        const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!user_id) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required.'
            });
        }
        // First check if thread exists and user has permission
        const { data: thread, error: fetchError } = yield app_1.supabase
            .from('threads')
            .select('is_closed, author_id')
            .eq('id', thread_id)
            .eq('is_deleted', false)
            .single();
        if (fetchError || !thread) {
            return res.status(404).json({
                success: false,
                error: 'Thread not found.'
            });
        }
        // Check if user is the author (optional - remove if any user can toggle)
        if (thread.author_id !== user_id) {
            return res.status(403).json({
                success: false,
                error: 'You can only toggle status of your own threads.'
            });
        }
        // Toggle the status
        const { data: updatedThread, error: updateError } = yield app_1.supabase
            .from('threads')
            .update({
            is_closed: !thread.is_closed,
            updated_at: new Date().toISOString()
        })
            .eq('id', thread_id)
            .select('id, is_closed')
            .single();
        if (updateError) {
            return res.status(500).json({
                success: false,
                error: updateError.message
            });
        }
        return res.status(200).json({
            success: true,
            message: `Thread ${updatedThread.is_closed ? 'closed' : 'opened'} successfully.`,
            data: updatedThread
        });
    }
    catch (error) {
        console.error('Unexpected error in toggleThreadStatus:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error while toggling thread status.',
            message: error.message || 'Unexpected failure.'
        });
    }
});
exports.toggleThreadStatus = toggleThreadStatus;
