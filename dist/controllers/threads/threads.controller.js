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
exports.getThreadsByUserId = exports.updateReaction = exports.getAllThreads = exports.getThreadDetails = exports.updateThread = exports.deleteThread = exports.createThread = void 0;
const app_1 = require("../../app");
// add new thread
const createThread = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { title, description, imgs = [], category_id, keywords = [] } = req.body;
        const { id: author_id, first_name, last_name } = req.user;
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
                keywords
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
        const { title, description, imgs = [], category_id, keywords = [] } = req.body;
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
        const { data: thread, error } = yield app_1.supabase
            .from('threads')
            .select(`
        *,
        profiles!inner(avatar_url)  -- Perform inner join with the profiles table
      `)
            .eq('id', thread_id)
            .eq('is_active', true)
            .eq('is_deleted', false)
            .maybeSingle();
        if (error || !thread) {
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
        return res.json({ thread, userReaction });
    }
    catch (err) {
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
    const { data: threads, error } = yield app_1.supabase
        .from('threads')
        .select(`
      *,
      profiles!inner(avatar_url)
    `)
        .eq('is_active', true)
        .eq('is_deleted', false)
        .order('publish_date', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error)
        return res.status(500).json({ error: error.message });
    const threadsWithReactions = yield Promise.all(threads.map((thread) => __awaiter(void 0, void 0, void 0, function* () {
        let userReaction = null;
        if (user_id) {
            const { data: reactionData, error: reactionError } = yield app_1.supabase
                .from('thread_reactions')
                .select('type')
                .eq('user_id', user_id)
                .eq('target_type', 'thread')
                .eq('target_id', thread.id)
                .maybeSingle();
            if (!reactionError && reactionData) {
                userReaction = reactionData.type;
            }
        }
        return Object.assign(Object.assign({}, thread), { user_reaction: userReaction });
    })));
    return res.json(threadsWithReactions);
});
exports.getAllThreads = getAllThreads;
// apply like/dislike
const updateReaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { thread_id } = req.params;
    const { type } = req.body;
    const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
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
        .select('total_likes, total_dislikes')
        .eq('id', thread_id)
        .eq('is_deleted', false)
        .single();
    if (threadError) {
        return res.status(500).json({ error: 'Thread not found!' });
    }
    let newTotalLikes = (_b = threadData === null || threadData === void 0 ? void 0 : threadData.total_likes) !== null && _b !== void 0 ? _b : 0;
    let newTotalDislikes = (_c = threadData === null || threadData === void 0 ? void 0 : threadData.total_dislikes) !== null && _c !== void 0 ? _c : 0;
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
            const { error: updateThreadError } = yield app_1.supabase
                .from('threads')
                .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
                .eq('id', thread_id);
            if (updateThreadError)
                return res.status(500).json({ error: updateThreadError.message });
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
        const { error: updateThreadError } = yield app_1.supabase
            .from('threads')
            .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
            .eq('id', thread_id);
        if (updateThreadError)
            return res.status(500).json({ error: updateThreadError.message });
        return res.status(200).json({ message: `Reaction updated to ${type}!` });
    }
    else {
        if (type === 'like')
            newTotalLikes += 1;
        if (type === 'dislike')
            newTotalDislikes += 1;
        const { error: insertError } = yield app_1.supabase
            .from('thread_reactions')
            .insert([{ user_id, target_id: thread_id, target_type: 'thread', type }]);
        if (insertError)
            return res.status(500).json({ error: insertError.message });
        const { error: updateThreadError } = yield app_1.supabase
            .from('threads')
            .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
            .eq('id', thread_id);
        if (updateThreadError)
            return res.status(500).json({ error: updateThreadError.message });
        return res.status(200).json({ message: `${type} added!` });
    }
});
exports.updateReaction = updateReaction;
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
            return Object.assign(Object.assign({}, thread), { user_reaction: userReaction });
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
