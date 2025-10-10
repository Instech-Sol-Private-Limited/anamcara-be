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
exports.getSpammedThreads = exports.deleteSpamThread = exports.createSpamThread = void 0;
const app_1 = require("../../app");
// Add thread to spam
const createSpamThread = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { thread_id } = req.body;
        const { id: user_id } = req.user;
        // Check if thread exists
        const { data: threadData, error: threadError } = yield app_1.supabase
            .from('threads')
            .select('id')
            .eq('id', thread_id)
            .single();
        if (threadError || !threadData) {
            return res.status(404).json({ error: 'Thread not found!' });
        }
        // Check if it's already in spam
        const { data: existingSpam } = yield app_1.supabase
            .from('threads_spam')
            .select('id')
            .eq('thread_id', thread_id)
            .eq('user_id', user_id)
            .maybeSingle();
        if (existingSpam) {
            return res.status(400).json({ message: 'Thread already in your spam list.' });
        }
        // Insert new spam entry
        const { error: insertError } = yield app_1.supabase
            .from('threads_spam')
            .insert([{ thread_id, user_id }]);
        if (insertError) {
            console.error('Supabase insert error:', insertError);
            return res.status(500).json({
                error: insertError.message || 'Unknown error while adding spam thread.',
            });
        }
        return res.status(201).json({
            message: 'Thread added to your spam list!',
        });
    }
    catch (err) {
        return res.status(500).json({
            error: 'Internal server error',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.createSpamThread = createSpamThread;
// Remove thread from spam
const deleteSpamThread = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { thread_id } = req.params;
        const { id: user_id } = req.user;
        const { data: spamEntry } = yield app_1.supabase
            .from('threads_spam')
            .select('id')
            .eq('thread_id', thread_id)
            .eq('user_id', user_id)
            .maybeSingle();
        if (!spamEntry) {
            return res.status(200).json({ message: 'Thread already removed from your spam list.' });
        }
        const { error: deleteError } = yield app_1.supabase
            .from('threads_spam')
            .delete()
            .eq('id', spamEntry.id);
        if (deleteError) {
            return res.status(500).json({ error: deleteError.message });
        }
        return res.status(200).json({ message: 'Thread removed from your spam list!' });
    }
    catch (err) {
        console.error('Unexpected error in deleteSpamThread:', err);
        return res.status(500).json({
            error: 'Internal server error while removing spam thread.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.deleteSpamThread = deleteSpamThread;
// Get all spammed threads
const getSpammedThreads = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id: user_id } = req.user;
        const { data: spamEntries, error: spamError } = yield app_1.supabase
            .from('threads_spam')
            .select('thread_id')
            .eq('user_id', user_id);
        if (spamError) {
            console.error('Error fetching spammed thread IDs:', spamError);
            return res.status(500).json({ error: 'Failed to retrieve spammed threads.' });
        }
        const spamThreadIds = (spamEntries === null || spamEntries === void 0 ? void 0 : spamEntries.map(entry => entry.thread_id)) || [];
        if (spamThreadIds.length === 0) {
            return res.status(200).json({ data: [], message: 'No spammed threads found.' });
        }
        const { data: threads, error: threadError } = yield app_1.supabase
            .from('threads')
            .select(`
        *,
        profiles!inner(avatar_url)
      `)
            .in('id', spamThreadIds)
            .eq('is_active', true)
            .eq('is_deleted', false)
            .order('publish_date', { ascending: false });
        if (threadError) {
            console.error('Error fetching thread data:', threadError);
            return res.status(500).json({ error: 'Failed to retrieve thread details.' });
        }
        return res.status(200).json({ data: threads });
    }
    catch (err) {
        console.error('Unexpected error in getSpammedThreads:', err);
        return res.status(500).json({
            error: 'Internal server error while fetching spammed threads.',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.getSpammedThreads = getSpammedThreads;
