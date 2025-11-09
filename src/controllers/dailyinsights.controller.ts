import { Request, Response } from 'express';
import { supabase } from "../app";

export const getDailyInsights = async (req: Request, res: Response): Promise<void> => {
  try {
    
    const { data, error } = await supabase
      .from('daily_insights')
      .select(`
        ranking,
        total_reactions,
        date,
        threads:thread_id (
          id,
          title,
          description,
          imgs,
          category_name,
          author_name,
          author_id,
          publish_date,
          total_likes,
          total_insightfuls,
          total_hearts,
          total_hugs,
          total_souls,
          is_active,
          is_deleted
        )
      `)
      .order('ranking', { ascending: true });

    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }

    if (!data || data.length === 0) {
      res.status(404).json({ 
        success: false,
        message: "No insights found for today",
      });
      return;
    }

    const insights = data.map(insight => {
      if (!insight.threads) {
        throw new Error(`Missing thread data for insight with ranking ${insight.ranking}`);
      }
      
      return {
        ranking: insight.ranking,
        date: insight.date,
        total_reactions: insight.total_reactions,
        ...insight.threads
      };
    });

    res.status(200).json({
      success: true,
      data: insights
    });

  } catch (error) {
    console.error('Error in getDailyInsights:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch daily insights',
      message: errorMessage,
    });
  }
};

export const getCommunityStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Active Souls Today - Count unique users from user_activities (last 24 hours)
    const { data: activeUsersData, error: activeUsersError } = await supabase
      .from('user_activities')
      .select('user_id')
      .gte('created_at', twentyFourHoursAgo.toISOString())
      .not('user_id', 'is', null);

    if (activeUsersError) {
      throw new Error(`Supabase error: ${activeUsersError.message}`);
    }

    const uniqueUserIds = [...new Set(activeUsersData?.map(activity => activity.user_id) || [])];
    const activeSoulsCount = uniqueUserIds.length;

    // Reflections Posted - Total count of all posts (not time-limited)
    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select('id', { count: 'exact' });

    if (postsError) {
      throw new Error(`Supabase error: ${postsError.message}`);
    }

    const reflectionsPosted = postsData?.length || 0;

    // Communities Alive - Count active chambers
    const { data: chambersData, error: chambersError } = await supabase
      .from('custom_chambers')
      .select('id', { count: 'exact' })
      .eq('is_active', true);

    if (chambersError) {
      throw new Error(`Supabase error: ${chambersError.message}`);
    }

    const communitiesAlive = chambersData?.length || 0;

    // Live Connections - Count active streams and ongoing chats
    const { data: activeStreamsData, error: streamsError } = await supabase
      .from('active_streams')
      .select('id', { count: 'exact' });

    if (streamsError) {
      throw new Error(`Supabase error: ${streamsError.message}`);
    }

    const { data: activeChatsData, error: chatsError } = await supabase
      .from('chats')
      .select('id', { count: 'exact' });

    if (chatsError) {
      throw new Error(`Supabase error: ${chatsError.message}`);
    }

    const liveConnections = (activeStreamsData?.length || 0) + (activeChatsData?.length || 0);

    // Soul Reactions - Total reactions from all reaction tables
    const { data: threadReactionsData, error: threadReactionsError } = await supabase
      .from('thread_reactions')
      .select('id', { count: 'exact' });

    if (threadReactionsError) {
      throw new Error(`Supabase error: ${threadReactionsError.message}`);
    }

    const { data: soulStoryReactionsData, error: soulStoryReactionsError } = await supabase
      .from('soul_story_reactions')
      .select('id', { count: 'exact' });

    if (soulStoryReactionsError) {
      throw new Error(`Supabase error: ${soulStoryReactionsError.message}`);
    }

    const { data: postVotesData, error: postVotesError } = await supabase
      .from('post_votes')
      .select('id', { count: 'exact' });

    if (postVotesError) {
      throw new Error(`Supabase error: ${postVotesError.message}`);
    }

    const { data: commentVotesData, error: commentVotesError } = await supabase
      .from('comment_votes')
      .select('id', { count: 'exact' });

    if (commentVotesError) {
      throw new Error(`Supabase error: ${commentVotesError.message}`);
    }

    const soulReactions = 
      (threadReactionsData?.length || 0) +
      (soulStoryReactionsData?.length || 0) +
      (postVotesData?.length || 0) +
      (commentVotesData?.length || 0);

    // Energy Flow - Get total counts from all history tables (not time-limited)
    const { data: soulPointsData, error: soulPointsError } = await supabase
      .from('soulpoints_history')
      .select('points_earned');

    if (soulPointsError) {
      throw new Error(`Supabase error: ${soulPointsError.message}`);
    }

    const { data: anamCoinsData, error: anamCoinsError } = await supabase
      .from('anamcoins_history')
      .select('amount');

    if (anamCoinsError) {
      throw new Error(`Supabase error: ${anamCoinsError.message}`);
    }

    const { data: accessBonusData, error: accessBonusError } = await supabase
      .from('accessbonus_history')
      .select('amount');

    if (accessBonusError) {
      throw new Error(`Supabase error: ${accessBonusError.message}`);
    }

    // Calculate totals for Energy Flow - handle different data types properly
    const soulPointsFlow = soulPointsData?.reduce((sum, item) => {
      const points = Number(item.points_earned) || 0;
      return sum + points;
    }, 0) || 0;

    const anamCoinsFlow = anamCoinsData?.reduce((sum, item) => {
      const amount = Number(item.amount) || 0;
      return sum + amount;
    }, 0) || 0;

    const accessBonusFlow = accessBonusData?.reduce((sum, item) => {
      const amount = Number(item.amount) || 0;
      return sum + amount;
    }, 0) || 0;

    const energyFlow = soulPointsFlow + anamCoinsFlow + accessBonusFlow;

    // SoulPower Level - Combined engagement score across all six metrics
    // You can adjust these weights based on what's most important for your platform
    const soulPowerLevel = 
      (activeSoulsCount * 1.5) +           // Active users are very important
      (reflectionsPosted * 2) +            // Content creation is highly valued
      (communitiesAlive * 3) +             // Active communities drive engagement
      (liveConnections * 4) +              // Real-time interactions are premium engagement
      (soulReactions * 0.5) +              // Reactions show content appreciation
      (energyFlow * 0.01);                 // Economic activity scaled down

    // Calculate percentage for the meter (0-100%)
    // You can adjust the maxExpected value based on your platform scale
    const maxExpectedSoulPower = 10000; // Adjust this based on your expected maximum
    const soulPowerPercentage = Math.min(100, Math.round((soulPowerLevel / maxExpectedSoulPower) * 100));

    res.status(200).json({
      success: true,
      data: {
        active_souls_today: activeSoulsCount,
        reflections_posted: reflectionsPosted,
        communities_alive: communitiesAlive,
        live_connections: liveConnections,
        soul_reactions: soulReactions,
        energy_flow: energyFlow,
        soulpower_level: {
          score: Math.round(soulPowerLevel),
          percentage: soulPowerPercentage,
          level: getSoulPowerLevel(soulPowerPercentage),
          description: getSoulPowerDescription(soulPowerPercentage)
        },
        breakdown: {
          soul_points: soulPointsFlow,
          anam_coins: anamCoinsFlow,
          access_bonus: accessBonusFlow
        },
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch community stats',
      message: errorMessage,
    });
  }
};

function getSoulPowerLevel(percentage: number): string {
  if (percentage >= 90) return 'Cosmic';
  if (percentage >= 75) return 'Celestial';
  if (percentage >= 60) return 'Radiant';
  if (percentage >= 45) return 'Vibrant';
  if (percentage >= 30) return 'Growing';
  if (percentage >= 15) return 'Awakening';
  return 'Dormant';
}

function getSoulPowerDescription(percentage: number): string {
  if (percentage >= 90) return 'The community is thriving with cosmic energy!';
  if (percentage >= 75) return 'Celestial engagement levels reached!';
  if (percentage >= 60) return 'Radiant energy flowing through the ecosystem';
  if (percentage >= 45) return 'Vibrant connections and meaningful interactions';
  if (percentage >= 30) return 'Growing engagement and building momentum';
  if (percentage >= 15) return 'Community is awakening and finding its rhythm';
  return 'The soul of the community is resting and gathering energy';
}