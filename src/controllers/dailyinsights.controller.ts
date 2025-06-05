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