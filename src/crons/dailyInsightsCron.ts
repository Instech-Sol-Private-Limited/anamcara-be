import { supabase } from '../app';

async function getTopTrendingThreads() {
    const { data, error } = await supabase
        .from('threads')
        .select(`
      id,
      total_likes,
      total_insightfuls,
      total_hearts,
      total_hugs,
      total_souls
    `)
        .neq('imgs', '{}')
        .eq('is_active', true)
        .eq('is_deleted', false);

    if (error) throw error;

    return data
        .map(thread => ({
            ...thread,
            total_reactions:
                (thread.total_likes || 0) +
                (thread.total_insightfuls || 0) +
                (thread.total_hearts || 0) +
                (thread.total_hugs || 0) +
                (thread.total_souls || 0)
        }))
        .sort((a, b) => b.total_reactions - a.total_reactions)
        .slice(0, 7);
}

const updateDailyInsights = async () => {
    try {
        const topThreads = await getTopTrendingThreads();
        const today = new Date().toISOString().split('T')[0];

        await supabase
            .from('daily_insights')
            .delete()
            .neq('id', 0);

        const inserts = topThreads.map((thread, index) => ({
            thread_id: thread.id,
            ranking: index + 1,
            date: today,
            total_reactions: thread.total_reactions
        }));

        const { error } = await supabase
            .from('daily_insights')
            .insert(inserts);

        if (error) throw error;

        console.log(`Updated daily insights for ${today}`);
    } catch (error) {
        console.error('Error updating daily insights:', error);
    }
}

export default updateDailyInsights;

