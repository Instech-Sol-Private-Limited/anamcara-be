import { Request, Response } from "express";
import { soulStoriesServices } from '../../services/soulStories.services';


// Add type for story data
interface StoryData {
  id: string;
  status: string;
  price: number;
  category: string;
  free_pages: number;
  free_episodes: number;
  title: string;
  story_type: string;
  created_at: string;
  monetization_type: string;
}

export const createStory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      title,
      description,
      tags = [],
      category,
      story_type,
      thumbnail_url,
      asset_type,
      asset_url,
      episodes = [],
      monetization_type = 'free',
      price = 0,
      free_pages = 0,
      free_episodes = 0
    } = req.body;

    // Basic validation
    if (!title?.trim() || !category?.trim() || !description?.trim() || !story_type?.trim()) {
      res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: title, category, description, story_type' 
      });
      return;
    }

    // Determine content structure based on story_type and episodes
    const content_structure = story_type === 'episodes' ? 'episodes' : 'single_asset';

   
    if (content_structure === 'single_asset') {
      if (!asset_url?.trim() || !asset_type?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields for single asset: asset_url, asset_type'
        });
        return;
      }
      if (!['video', 'document'].includes(asset_type)) {
        res.status(400).json({
          success: false,
          message: 'asset_type must be either "video" or "document"'
        });
        return;
      }
    } else {
      // Episode-based validation - make episodes optional
      if (episodes && episodes.length > 0) {
        // Validate each episode only if episodes are provided
        for (const [index, episode] of episodes.entries()) {
          if ( !episode.video_url?.trim()) {
            res.status(400).json({
              success: false,
              message: `Episode ${index + 1} is missing required fields: title, video_url`
            });
            return;
          }
        }
      }
      // If no episodes provided, that's fine - it's just a story without episodes
    }

    // Monetization type validation
    if (!['free', 'premium', 'subscription'].includes(monetization_type)) {
      res.status(400).json({
        success: false,
        message: 'monetization_type must be one of: free, premium, subscription'
      });
      return;
    }

    // Price validation for premium content
    if (monetization_type !== 'free' && price <= 0) {
      res.status(400).json({
        success: false,
        message: 'Price must be greater than 0 for premium content'
      });
      return;
    }

    // Free content validation
    if (free_pages < 0 || free_episodes < 0) {
      res.status(400).json({
        success: false,
        message: 'Free pages and episodes cannot be negative'
      });
      return;
    }

    const storyData = {
      author_id: userId,
      title: title.trim(),
      description: description.trim(),
      tags,
      category: category.trim(),
      story_type: story_type.trim(),
      thumbnail_url: thumbnail_url?.trim() || null,
      asset_url: asset_url?.trim() || null, // Always use what frontend sends
      asset_type: asset_type || null, // Always use what frontend sends
      monetization_type,
      price,
      free_pages,
      free_episodes,
      status: 'draft',
      content_type: content_structure
    };

    console.log(storyData, "storyData");
    const story = await soulStoriesServices.createStory(storyData, episodes, userId);
    res.status(201).json({ 
      success: true,
      message: 'Story created successfully',
      story 
    });
  } catch (error) {
    console.error('Error creating story:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: 'Failed to create story'
    });
  }
};

export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Use service instead of direct Supabase call
    const analytics = await soulStoriesServices.getAnalytics(userId);
    
    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch analytics'
    });
  }
};
export const getStories = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { type } = req.params; // 'all', 'animation', 'book', 'video-drama', etc.
    const { 
      page ,       // page number
      limit ,     // items per page
      sort = 'newest' // sorting: 'newest', 'oldest', 'popular', 'rating'
    } = req.query;

    const response = await soulStoriesServices.getStories(userId, type, {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      sort: sort as string
    });

    res.status(200).json({
      success: true,
      type: type,
      ...response
    });

  } catch (error) {
    console.error('Error fetching stories:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch stories'
    });
  }
};