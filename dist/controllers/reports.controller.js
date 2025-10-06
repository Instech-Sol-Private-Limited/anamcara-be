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
exports.getReportedPosts = exports.getReportsByPostId = exports.createPostReport = exports.getReportedThreads = exports.getReportsByThreadId = exports.createThreadReport = void 0;
const app_1 = require("../app");
// create thread report
const createThreadReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { thread_id, reason, description } = req.body;
        const { id: user_id } = req.user;
        const { data: threadData, error: threadError } = yield app_1.supabase
            .from('threads')
            .select('id')
            .eq('id', thread_id)
            .single();
        if (threadError || !threadData) {
            return res.status(404).json({ error: 'Thread not found!' });
        }
        const { data: existingSpam } = yield app_1.supabase
            .from('thread_reports')
            .select('id')
            .eq('thread_id', thread_id)
            .eq('user_id', user_id)
            .maybeSingle();
        if (existingSpam) {
            return res.status(400).json({ message: 'Thread already in your report list.' });
        }
        // Insert new spam entry
        const { error: insertError } = yield app_1.supabase
            .from('thread_reports')
            .insert([{ reason, description, thread_id, user_id }]);
        if (insertError) {
            console.error('Supabase insert error:', insertError);
            return res.status(500).json({
                error: insertError.message || 'Unknown error while adding reporting thread.',
            });
        }
        return res.status(201).json({
            message: 'Thread added to your report list!',
        });
    }
    catch (err) {
        return res.status(500).json({
            error: 'Internal server error',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.createThreadReport = createThreadReport;
const createPostReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { post_id, reason, description } = req.body;
        const { id: user_id } = req.user;
        // Check if post exists
        const { data: postData, error: postError } = yield app_1.supabase
            .from('posts')
            .select('id')
            .eq('id', post_id)
            .single();
        if (postError || !postData) {
            return res.status(404).json({ error: 'Post not found!' });
        }
        // Check if already reported by this user
        const { data: existingReport } = yield app_1.supabase
            .from('thread_reports')
            .select('id')
            .eq('post_id', post_id)
            .eq('user_id', user_id)
            .maybeSingle();
        if (existingReport) {
            return res.status(400).json({ message: 'Post already in your report list.' });
        }
        // Insert new report
        const { error: insertError } = yield app_1.supabase
            .from('thread_reports')
            .insert([{ reason, description, post_id, user_id }]);
        if (insertError) {
            console.error('Supabase insert error:', insertError);
            return res.status(500).json({
                error: insertError.message || 'Unknown error while adding reporting post.',
            });
        }
        return res.status(201).json({
            message: 'Post added to your report list!',
        });
    }
    catch (err) {
        return res.status(500).json({
            error: 'Internal server error',
            message: err.message || 'Unexpected failure.',
        });
    }
});
exports.createPostReport = createPostReport;
// Get all spammed threads
const getReportedThreads = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Only select reports where thread_id is not null and post_id is null
        const { data: reports, error: reportsError } = yield app_1.supabase
            .from('thread_reports')
            .select('thread_id')
            .not('thread_id', 'is', null)
            .is('post_id', null);
        if (reportsError) {
            return res.status(500).json({ error: 'Failed to fetch reports.' });
        }
        if (!reports || reports.length === 0) {
            return res.status(200).json({ data: [], message: 'No reported threads found.' });
        }
        const countMap = {};
        for (const report of reports) {
            countMap[report.thread_id] = (countMap[report.thread_id] || 0) + 1;
        }
        const threadIds = Object.keys(countMap);
        const { data: threads, error: threadsError } = yield app_1.supabase
            .from('threads')
            .select('id, title, is_active')
            .in('id', threadIds);
        if (threadsError) {
            return res.status(500).json({ error: 'Failed to fetch thread details.' });
        }
        const result = threads.map(thread => ({
            thread_id: thread.id,
            title: thread.title,
            is_active: thread.is_active,
            total_reports: countMap[thread.id] || 0,
        }));
        return res.status(200).json(result);
    }
    catch (err) {
        console.error('Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});
exports.getReportedThreads = getReportedThreads;
// Get all spammed threads
const getReportsByThreadId = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { thread_id } = req.body;
        const { data: reports, error: reportsError } = yield app_1.supabase
            .from('thread_reports')
            .select('*')
            .eq('thread_id', thread_id);
        if (reportsError) {
            return res.status(500).json({ error: 'Failed to fetch reports!' });
        }
        return res.status(200).json(reports);
    }
    catch (err) {
        console.error('Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});
exports.getReportsByThreadId = getReportsByThreadId;
const getReportsByPostId = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { post_id } = req.params;
        let query = app_1.supabase.from('thread_reports').select('*');
        if (post_id !== 'all') {
            query = query.eq('post_id', post_id);
        }
        const { data: reports, error: reportsError } = yield query;
        if (reportsError) {
            return res.status(500).json({ error: 'Failed to fetch reports!' });
        }
        return res.status(200).json(reports);
    }
    catch (err) {
        console.error('Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});
exports.getReportsByPostId = getReportsByPostId;
const getReportedPosts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Only select reports where thread_id is not null and post_id is null
        const { data: reports, error: reportsError } = yield app_1.supabase
            .from('thread_reports')
            .select('post_id')
            .not('post_id', 'is', null)
            .is('thread_id', null);
        if (reportsError) {
            return res.status(500).json({ error: 'Failed to fetch reports.' });
        }
        if (!reports || reports.length === 0) {
            return res.status(200).json({ data: [], message: 'No reported threads found.' });
        }
        const countMap = {};
        for (const report of reports) {
            countMap[report.post_id] = (countMap[report.post_id] || 0) + 1;
        }
        const postIds = Object.keys(countMap);
        const { data: posts, error: postsError } = yield app_1.supabase
            .from('posts')
            .select('id, content, post_type,feeling_emoji,feeling_label,question_category, is_active')
            .in('id', postIds);
        if (postsError) {
            return res.status(500).json({ error: 'Failed to fetch thread details.' });
        }
        const result = posts.map(post => ({
            post_id: post.id,
            content: post.content,
            post_type: post.post_type,
            feeling_emoji: post.feeling_emoji,
            feeling_label: post.feeling_label,
            question_category: post.question_category,
            is_active: post.is_active,
            total_reports: countMap[post.id] || 0,
        }));
        return res.status(200).json(result);
    }
    catch (err) {
        console.error('Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});
exports.getReportedPosts = getReportedPosts;
