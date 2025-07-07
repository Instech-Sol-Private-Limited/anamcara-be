import { Request, Response } from 'express';
import { supabase } from '../app';

// create thread report
const createThreadReport = async (req: Request, res: Response): Promise<any> => {
    try {
        const { thread_id, reason, description } = req.body;
        const { id: user_id } = req.user!;

        const { data: threadData, error: threadError } = await supabase
            .from('threads')
            .select('id')
            .eq('id', thread_id)
            .single();

        if (threadError || !threadData) {
            return res.status(404).json({ error: 'Thread not found!' });
        }

        const { data: existingSpam } = await supabase
            .from('thread_reports')
            .select('id')
            .eq('thread_id', thread_id)
            .eq('user_id', user_id)
            .maybeSingle();

        if (existingSpam) {
            return res.status(400).json({ message: 'Thread already in your report list.' });
        }

        // Insert new spam entry
        const { error: insertError } = await supabase
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

    } catch (err: any) {
        return res.status(500).json({
            error: 'Internal server error',
            message: err.message || 'Unexpected failure.',
        });
    }
};


const createPostReport = async (req: Request, res: Response): Promise<any> => {
    try {
        const { post_id, reason, description } = req.body;
        const { id: user_id } = req.user!;

        // Check if post exists
        const { data: postData, error: postError } = await supabase
            .from('posts')
            .select('id')
            .eq('id', post_id)
            .single();

        if (postError || !postData) {
            return res.status(404).json({ error: 'Post not found!' });
        }

        // Check if already reported by this user
        const { data: existingReport } = await supabase
            .from('thread_reports')
            .select('id')
            .eq('post_id', post_id)
            .eq('user_id', user_id)
            .maybeSingle();

        if (existingReport) {
            return res.status(400).json({ message: 'Post already in your report list.' });
        }

        // Insert new report
        const { error: insertError } = await supabase
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

    } catch (err: any) {
        return res.status(500).json({
            error: 'Internal server error',
            message: err.message || 'Unexpected failure.',
        });
    }
};

// Get all spammed threads
const getReportedThreads = async (
    req: Request,
    res: Response
): Promise<any> => {
    try {
        // Only select reports where thread_id is not null and post_id is null
        const { data: reports, error: reportsError } = await supabase
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

        const countMap: Record<string, number> = {};
        for (const report of reports) {
            countMap[report.thread_id] = (countMap[report.thread_id] || 0) + 1;
        }

        const threadIds = Object.keys(countMap);

        const { data: threads, error: threadsError } = await supabase
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

    } catch (err: any) {
        console.error('Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
};

// Get all spammed threads
const getReportsByThreadId = async (
    req: Request,
    res: Response
): Promise<any> => {
    try {
        const { thread_id } = req.body;
        const { data: reports, error: reportsError } = await supabase
            .from('thread_reports')
            .select('*')
            .eq('thread_id', thread_id);

        if (reportsError) {
            return res.status(500).json({ error: 'Failed to fetch reports!' });
        }

        return res.status(200).json(reports);
    } catch (err: any) {
        console.error('Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
};

const getReportsByPostId = async (
    req: Request,
    res: Response
): Promise<any> => {
    try {
        const { post_id } = req.params;
        let query = supabase.from('thread_reports').select('*');
        if (post_id !== 'all') {
            query = query.eq('post_id', post_id);
        }
        const { data: reports, error: reportsError } = await query;

        if (reportsError) {
            return res.status(500).json({ error: 'Failed to fetch reports!' });
        }

        return res.status(200).json(reports);
    } catch (err: any) {
        console.error('Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
};

const getReportedPosts = async (
    req: Request,
    res: Response
): Promise<any> => {
    try {
        // Only select reports where thread_id is not null and post_id is null
        const { data: reports, error: reportsError } = await supabase
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

        const countMap: Record<string, number> = {};
        for (const report of reports) {
            countMap[report.post_id] = (countMap[report.post_id] || 0) + 1;
        }

        const postIds = Object.keys(countMap);

        const { data: posts, error: postsError } = await supabase
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

    } catch (err: any) {
        console.error('Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
};

export {
    createThreadReport,
    getReportsByThreadId,
    getReportedThreads,
    createPostReport,
    getReportsByPostId,
    getReportedPosts,
};
