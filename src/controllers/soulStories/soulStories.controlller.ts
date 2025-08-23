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
export const deleteeStory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const { story_id } = req.params; // Changed from req.body to req.params
    
    if (!story_id) {
      res.status(400).json({
        success: false,
        message: 'Story ID is required'
      });
      return;
    }

    await soulStoriesServices.deleteStory(userId, story_id);
    
    res.status(200).json({
      success: true,
      message: 'Story deleted successfully'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
export const purchaseContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { storyId, contentData } = req.body;
    console.log('Controller received:', { storyId, contentData }); // Add this log

    if (!storyId || !contentData || !Array.isArray(contentData)) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: storyId, contentData (array)'
      });
      return;
    }

    if (contentData.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Content data array cannot be empty'
      });
      return; // Keep this return for early exit
    }

    // Validate each content item
    for (const item of contentData) {
      if (!item.type || !['page', 'episode'].includes(item.type) || 
          item.identifier === undefined || item.coins <= 0) {
        res.status(400).json({
          success: false,
          message: 'Each content item must have: type (page/episode), identifier, coins > 0'
        });
        return; // Keep this return for early exit
      }
    }

    const result = await soulStoriesServices.purchaseContent(userId, storyId, contentData);
    res.status(200).json(result); // Remove 'return' here

  } catch (error) {
    console.error('Error in purchaseContent controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to purchase content'
    });
  }
};

export const getStoryAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { storyId } = req.params;
    console.log('Controller received storyId:', storyId); // Add this log

    if (!storyId) {
      res.status(400).json({
        success: false,
        message: 'Story ID is required'
      });
      return;
    }

    const accessStatus = await soulStoriesServices.getStoryAccess(userId, storyId);

    res.status(200).json({
      success: true,
      data: accessStatus
    });

  } catch (error) {
    console.error('Error in getStoryAccess controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to get story access'
    });
  }
};

export const getUserRevenue = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const revenue = await soulStoriesServices.getUserRevenue(userId);

    res.status(200).json({
      success: true,
      data: revenue
    });

  } catch (error) {
    console.error('Error in getUserRevenue controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch user revenue'
    });
  }
};
export const searchAllContent = async (req: Request, res: Response) => {
  try {
    const { query, category } = req.body;
    console.log('Received query:', query, 'category:', category);
    
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    if (!query || !category) {
      res.status(400).json({ 
        success: false,
        message: 'Search query and category are required' 
      });
      return;
    }

    const searchResults = await soulStoriesServices.searchAllContent(query as string, category as string, userId as string);
    
    // Just return the searchResults directly since it already has success: true
    res.status(200).json(searchResults);
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};