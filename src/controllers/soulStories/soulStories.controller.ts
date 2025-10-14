import { Request, Response } from "express";
import { soulStoriesServices } from "../../services/soulStories.services";
import 'dotenv/config';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
      free_episodes = 0,
      remix = false,
      co_authors // OPTIONAL: Can be undefined, null, or empty array
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
          if (!episode.video_url?.trim()) {
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
      content_type: content_structure,
      remix,
      // ONLY add co_authors if it exists and has values
      ...(co_authors && co_authors.length > 0 && { co_authors })
    };

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
      page,       // page number
      limit,     // items per page
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

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    if (!query) {
      res.status(400).json({
        success: false,
        message: 'Query is required'
      });
      return;
    }

    // ✅ Check if query is a UUID (story ID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);

    const searchResults = await soulStoriesServices.searchAllContent(
      query as string,
      category as string,
      userId as string,
      isUUID ? query : undefined // ✅ Pass as storyId if it's a UUID
    );

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

export const createComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { soul_story_id, content, imgs = [] } = req.body;

    if (!content?.trim() || !soul_story_id) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: content, soul_story_id'
      });
      return;
    }

    const result = await soulStoriesServices.createComment(userId, soul_story_id, content, imgs);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error in createComment controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to create comment'
    });
  }
};

export const getComments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { soul_story_id, page = 1, limit = 10 } = req.query;
    const userId = req.user?.id;

    if (!soul_story_id) {
      res.status(400).json({
        success: false,
        message: 'soul_story_id is required'
      });
      return;
    }

    const result = await soulStoriesServices.getComments(
      soul_story_id as string,
      Number(page),
      Number(limit),
      userId
    );

    res.status(200).json(result);

  } catch (error) {
    console.error('Error in getComments controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch comments'
    });
  }
};

export const updateComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { comment_id } = req.params;
    const { content, imgs } = req.body;

    if (!content?.trim()) {
      res.status(400).json({
        success: false,
        message: 'Content is required'
      });
      return;
    }

    const result = await soulStoriesServices.updateComment(userId, comment_id, content, imgs);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error in updateComment controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update comment'
    });
  }
};

export const deleteComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { comment_id } = req.params;

    const result = await soulStoriesServices.deleteComment(userId, comment_id);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error in deleteComment controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to delete comment'
    });
  }
};

export const updateCommentReaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { comment_id } = req.params;
    const { type } = req.body;

    if (!type) {
      res.status(400).json({
        success: false,
        message: 'Reaction type is required'
      });
      return;
    }

    if (!['like', 'dislike', 'insightful', 'heart', 'hug', 'soul'].includes(type)) {
      res.status(400).json({
        success: false,
        message: `Invalid reaction type: ${type}. Must be one of: like, dislike, insightful, heart, hug, soul`
      });
      return;
    }

    if (!comment_id) {
      res.status(400).json({
        success: false,
        message: 'Comment ID is required'
      });
      return;
    }

    const result = await soulStoriesServices.updateCommentReaction(userId, comment_id, type);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error in updateCommentReaction controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update comment reaction'
    });
  }
};

export const updateStoryReaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { story_id } = req.params;
    const { type } = req.body;

    if (!['like', 'dislike', 'insightful', 'heart', 'hug', 'soul'].includes(type)) {
      res.status(400).json({
        success: false,
        message: 'Invalid reaction type'
      });
      return;
    }

    const result = await soulStoriesServices.updateStoryReaction(userId, story_id, type);

    if (result.success && result.data) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          reaction_counts: result.data.reaction_counts,
          user_reaction: result.data.user_reaction,
          total_reactions: result.data.total_reactions
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    console.error('Error in updateStoryReaction controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update story reaction'
    });
  }
};

export const createReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { comment_id, content, imgs = [] } = req.body;

    if (!content?.trim() || !comment_id) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: content, comment_id'
      });
      return;
    }

    const result = await soulStoriesServices.createReply(userId, comment_id, content, imgs);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error in createReply controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to create reply'
    });
  }
};

export const getStoryWithReactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { story_id } = req.params;
    const userId = req.user?.id;

    if (!story_id) {
      res.status(400).json({
        success: false,
        message: 'Story ID is required'
      });
      return;
    }

    const result = await soulStoriesServices.getStoryWithReactions(story_id, userId);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error in getStoryWithReactions controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch story with reactions'
    });
  }
};

export const getCommentReactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { comment_id } = req.params;
    const userId = req.user?.id;
    if (!comment_id) {
      res.status(400).json({
        success: false,
        message: 'Comment ID is required'
      });
      return;
    }

    const result = await soulStoriesServices.getCommentReactions(comment_id, userId);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error in getCommentReactions controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to fetch comment reactions'
    });
  }
};

export const getTrendingStories = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 200 } = req.query;

    const result = await soulStoriesServices.getTrendingStories(
      userId,
      Number(page),
      Number(limit)
    );

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const boostSoulStory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { story_id, boost_type } = req.body;

    if (!story_id || !boost_type || !['weekly', 'monthly'].includes(boost_type)) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: story_id, boost_type (weekly/monthly)'
      });
      return;
    }

    const result = await soulStoriesServices.boostSoulStory(userId, story_id, boost_type);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getUserSoulStoryBoosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = await soulStoriesServices.getUserSoulStoryBoosts(userId);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getProductDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storyId } = req.params;

    if (!storyId) {
      res.status(400).json({
        success: false,
        message: 'Story ID is required'
      });
      return;
    }

    const result = await soulStoriesServices.getProductDetails(storyId);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getProductDetails controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch product details'
    });
  }
};

export const getAllUsersStoriesData = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await soulStoriesServices.getAllUsersStoriesData();

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getAllUsersStoriesData controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch users stories data'
    });
  }
};

export const createStoryReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { storyId, reportContent, reportReason } = req.body;

    if (!storyId || !reportContent || !reportReason) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: storyId, reportContent, reportReason'
      });
      return;
    }

    const result = await soulStoriesServices.createStoryReport(userId, storyId, reportContent, reportReason);

    if (result.success === false && result.already_reported) {
      // Return 200 for already reported
      res.status(200).json(result);
      return;
    }

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Error in createStoryReport controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to create report'
    });
  }
};

export const getStoryReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storyId } = req.params;

    if (!storyId) {
      res.status(400).json({
        success: false,
        message: 'Story ID is required'
      });
      return;
    }

    const result = await soulStoriesServices.getStoryReports(storyId);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getStoryReports controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch reports'
    });
  }
};

export const getUserFriends = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized - User ID not found in token' });
      return;
    }

    const result = await soulStoriesServices.getUserFriends(userId);
    res.status(200).json(result);

  } catch (err) {
    console.error('Error in getUserFriends controller:', err);
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
};

export const generateThumbnailSuggestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
      return;
    }

    const accessStatus = await soulStoriesServices.checkAIToolAccess(userId, 'title_suggestion');

    if (!accessStatus.canUse) {
      res.status(403).json({
        success: false,
        message: accessStatus.message,
        needsPurchase: true
      });
      return;
    }

    const { content, suggestionCount = 3 } = req.body;

    if (!content?.trim()) {
      res.status(400).json({
        success: false,
        message: 'Content is required for generating suggestions'
      });
      return;
    }

    const words = content.trim().split(/\s+/).filter((word: string) => word.length > 0);
    if (words.length < 1) {
      res.status(400).json({
        success: false,
        message: 'Content should be at least 1 word long for meaningful suggestions'
      });
      return;
    }

    if (suggestionCount > 5 || suggestionCount < 1) {
      res.status(400).json({
        success: false,
        message: 'Suggestion count should be between 1 and 5'
      });
      return;
    }

    const suggestions = await soulStoriesServices.generateMultipleSuggestions(
      content,
      Math.min(suggestionCount, 3)
    );

    if (suggestions.length === 0) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate any suggestions. Please try again.'
      });
      return;
    }

    await soulStoriesServices.recordAIToolUsage(userId, 'title_suggestion');

    res.status(200).json({
      success: true,
      message: 'Thumbnail suggestions generated successfully',
      data: {
        suggestions,
        generatedAt: new Date().toISOString(),
        userId,
        usageCount: accessStatus.usageCount // Use usageCount from the service result
      }
    });

  } catch (error) {
    console.error('Error generating thumbnail suggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating suggestions',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

export const generateQuickSuggestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
      return;
    }

    const { content } = req.body;

    if (!content?.trim() || content.length < 1) {
      res.status(400).json({
        success: false,
        message: 'Content should be at least 1 character for quick suggestion'
      });
      return;
    }

    const suggestion = await soulStoriesServices.generateThumbnailSuggestions(content);

    res.status(200).json({
      success: true,
      message: 'Quick suggestion generated successfully',
      data: {
        title: suggestion.title,
        description: suggestion.description,  // Changed from coverIdea and summary
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error generating quick suggestion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate quick suggestion',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

export const updateStory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { story_id } = req.params;
    const {
      title,
      description,
      tags,
      category,
      story_type,
      thumbnail_url,
      asset_type,
      asset_url,
      episodes,
      monetization_type,
      price,
      free_pages,
      free_episodes,
      remix,
      co_authors,
      status
    } = req.body;

    if (!story_id) {
      res.status(400).json({
        success: false,
        message: 'Story ID is required'
      });
      return;
    }

    // ✅ Only validate fields that are provided
    const updateData: any = {};

    // Title validation (if provided)
    if (title !== undefined) {
      if (!title?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Title cannot be empty if provided'
        });
        return;
      }
      updateData.title = title.trim();
    }

    // Description validation (if provided)
    if (description !== undefined) {
      if (!description?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Description cannot be empty if provided'
        });
        return;
      }
      updateData.description = description.trim();
    }

    // Tags (if provided)
    if (tags !== undefined) {
      updateData.tags = tags;
    }

    // Category validation (if provided)
    if (category !== undefined) {
      if (!category?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Category cannot be empty if provided'
        });
        return;
      }
      updateData.category = category.trim();
    }

    // Story type validation (if provided)
    if (story_type !== undefined) {
      if (!story_type?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Story type cannot be empty if provided'
        });
        return;
      }
      updateData.story_type = story_type.trim();
    }

    // Thumbnail URL (if provided)
    if (thumbnail_url !== undefined) {
      updateData.thumbnail_url = thumbnail_url?.trim() || null;
    }

    // Asset validation (only if both asset_url and asset_type are provided)
    if (asset_url !== undefined || asset_type !== undefined) {
      if (asset_url !== undefined) {
        updateData.asset_url = asset_url?.trim() || null;
      }
      if (asset_type !== undefined) {
        updateData.asset_type = asset_type;
      }

      // Validate asset type if provided
      if (asset_type && !['video', 'document'].includes(asset_type)) {
        res.status(400).json({
          success: false,
          message: 'asset_type must be either "video" or "document"'
        });
        return;
      }
    }

    // Monetization validation (if provided)
    if (monetization_type !== undefined) {
      if (!['free', 'premium', 'subscription'].includes(monetization_type)) {
        res.status(400).json({
          success: false,
          message: 'monetization_type must be one of: free, premium, subscription'
        });
        return;
      }
      updateData.monetization_type = monetization_type;
    }

    // Price validation (if provided)
    if (price !== undefined) {
      if (monetization_type && monetization_type !== 'free' && price <= 0) {
        res.status(400).json({
          success: false,
          message: 'Price must be greater than 0 for premium content'
        });
        return;
      }
      updateData.price = price;
    }

    // Free pages/episodes (if provided)
    if (free_pages !== undefined) {
      if (free_pages < 0) {
        res.status(400).json({
          success: false,
          message: 'Free pages cannot be negative'
        });
        return;
      }
      updateData.free_pages = free_pages;
    }

    if (free_episodes !== undefined) {
      if (free_episodes < 0) {
        res.status(400).json({
          success: false,
          message: 'Free episodes cannot be negative'
        });
        return;
      }
      updateData.free_episodes = free_episodes;
    }

    // Remix (if provided)
    if (remix !== undefined) {
      updateData.remix = remix;
    }

    // Co-authors (if provided)
    if (co_authors !== undefined) {
      if (co_authors && co_authors.length > 0) {
        updateData.co_authors = co_authors;
      } else {
        updateData.co_authors = [];
      }
    }

    // Status (if provided)
    if (status !== undefined) {
      updateData.status = status;
    }

    // Content type (if story_type changed)
    if (updateData.story_type) {
      updateData.content_type = updateData.story_type === 'episodes' ? 'episodes' : 'single_asset';
    }

    // Add updated timestamp
    updateData.updated_at = new Date().toISOString();
    const result = await soulStoriesServices.updateStory(story_id, updateData, episodes, userId);

    res.status(200).json({
      success: true,
      message: 'Story updated successfully',
      story: result.story
    });

  } catch (error) {
    console.error('Error updating story:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to update story'
    });
  }
};

export const getKeywordSuggestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ suggestions: [] });
      return;
    }

    const cleanQuery = query.trim();

    if (cleanQuery.length < 1 || cleanQuery.length > 100) {
      res.status(400).json({
        success: false,
        message: 'Query length must be between 1 and 100 characters'
      });
      return;
    }

    const googleSuggestUrl = `http://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(cleanQuery)}`;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    const response = await fetch(googleSuggestUrl, { headers });

    if (!response.ok) {
      res.status(503).json({
        success: false,
        message: 'External service unavailable'
      });
      return;
    }

    const data = await response.json();

    let suggestions: string[] = [];
    if (data && Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
      suggestions = data[1].slice(0, 10);
    }

    res.status(200).json({
      success: true,
      suggestions,
      query: cleanQuery
    });

  } catch (error) {
    console.error('Keyword suggestion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get keyword suggestions'
    });
  }
};

export const correctGrammar = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
      return;
    }

    // No access check - always free
    const { text, maxChunkSize = 500 } = req.body;

    if (!text?.trim()) {
      res.status(400).json({
        success: false,
        message: 'Text is required for grammar correction'
      });
      return;
    }

    const result = await soulStoriesServices.correctGrammar(text, maxChunkSize);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Grammar correction completed successfully',
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message || 'Failed to correct grammar'
      });
    }

  } catch (error) {
    console.error('Error in correctGrammar controller:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while correcting grammar'
    });
  }
};

export const checkPdfQuality = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pdfUrl } = req.body;

    if (!pdfUrl) {
      res.status(400).json({
        success: false,
        message: 'PDF URL is required'
      });
      return;
    }

    const qualityCheck = await soulStoriesServices.checkPdfQualityFromBucket(pdfUrl);

    if (qualityCheck.success) {
      res.json({
        success: true,
        message: qualityCheck.message,
        data: qualityCheck.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: qualityCheck.message
      });
    }

  } catch (error) {
    console.error('Error checking PDF quality:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check PDF quality'
    });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads/pdfs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'pdf-' + uniqueSuffix + '.pdf');
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

export const uploadPdfMiddleware = upload.single('pdf');

export const uploadPdf = async (req: any, res: any): Promise<void> => {
  upload.single('pdf')(req, res, async (err) => {

    if (err) {
      res.status(400).json({
        success: false,
        message: err.message
      });
      return;
    }

    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
        return;
      }

      const filePath = `/uploads/pdfs/${req.file.filename}`;
      const fullFilePath = path.join(__dirname, '../../../uploads/pdfs', req.file.filename);

      // Add quality check here
      const qualityCheck = await soulStoriesServices.checkPdfQualityFromBucket(filePath);

      // Clean up file BEFORE sending response
      try {
        if (fs.existsSync(fullFilePath)) {
          fs.unlinkSync(fullFilePath);
        }
      } catch (cleanupError) {
        console.error('❌ Error cleaning up file:', cleanupError);
      }

      // Send response
      res.json({
        success: true,
        message: 'File uploaded successfully',
        data: {
          filename: req.file.filename,
          filePath: filePath,
          fileSize: req.file.size,
          qualityCheck: qualityCheck
        }
      });

    } catch (error) {
      console.error('❌ Error in upload logic:', error);

      // Clean up file even on error
      if (req.file) {
        const fullFilePath = path.join(__dirname, '../../../uploads/pdfs', req.file.filename);
        try {
          if (fs.existsSync(fullFilePath)) {
            fs.unlinkSync(fullFilePath);
          }
        } catch (cleanupError) {
          console.error('❌ Error cleaning up file after error:', cleanupError);
        }
      }

      res.status(500).json({
        success: false,
        message: 'Failed to upload file'
      });
    }
  });
};

export const shareStory = async (req: any, res: any): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
      return;
    }

    const { storyId, shareType = 'general' } = req.body;

    if (!storyId) {
      res.status(400).json({
        success: false,
        message: 'Story ID is required'
      });
      return;
    }

    const result = await soulStoriesServices.shareStory(userId, storyId, shareType);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error sharing story:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const purchaseAIToolAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
      return;
    }

    const { coinsRequired } = req.body;
    const toolType = req.body.toolType || req.body.type;

    if (!toolType || !['title_suggestion', 'description_suggestion', 'tags_suggestion', 'grammar_correction'].includes(toolType)) {
      res.status(400).json({ success: false, message: 'Invalid tool type' });
      return;
    }

    if (typeof coinsRequired !== 'number' || coinsRequired <= 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid coins amount'
      });
      return;
    }

    const result = await soulStoriesServices.purchaseAIToolAccess(userId, toolType, coinsRequired);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error purchasing AI tool access:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};