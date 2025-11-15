import { Request, Response } from "express";
import { soulStoriesServices } from "../services/soulStories.services";
import 'dotenv/config';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { supabase } from "../app";
import { sendNotification } from "../sockets/emitNotification";

type StoryReactionType = 'like' | 'support' | 'valuable' | 'funny' | 'shocked' | 'moved' | 'triggered';

export const categoryConfig = {
  // Episode Categories (Multiple Videos)
  'serial-fiction': {
    allowedTypes: ['mp4', 'mov', 'avi', 'mkv'],
    allowedMultiples: true,
    isEpisodeCategory: true,
    asset_type: 'video',
    story_type: 'episodes'
  },
  'video-drama': {
    allowedTypes: ['mp4', 'mov', 'avi', 'mkv'],
    allowedMultiples: true,
    isEpisodeCategory: true,
    asset_type: 'video',
    story_type: 'episodes'
  },
  'course': {
    allowedTypes: ['mp4', 'mov', 'avi', 'mkv'],
    allowedMultiples: true,
    isEpisodeCategory: true,
    asset_type: 'video',
    story_type: 'episodes'
  },

  // Multiple PDF Categories
  'webtoon': {
    allowedTypes: ['pdf'],
    allowedMultiples: true,
    isEpisodeCategory: false,
    asset_type: 'document',
    story_type: 'documents'
  },
  'manga': {
    allowedTypes: ['pdf'],
    allowedMultiples: true,
    isEpisodeCategory: false,
    asset_type: 'document',
    story_type: 'documents'
  },
  'manhwa': {
    allowedTypes: ['pdf'],
    allowedMultiples: true,
    isEpisodeCategory: false,
    asset_type: 'document',
    story_type: 'documents'
  },
  'poetry': {
    allowedTypes: ['pdf'],
    allowedMultiples: true,
    isEpisodeCategory: false,
    asset_type: 'document',
    story_type: 'documents'
  },
  'comic': {
    allowedTypes: ['pdf'],
    allowedMultiples: true,
    isEpisodeCategory: false,
    asset_type: 'document',
    story_type: 'documents'
  },
  'comic-strip': {
    allowedTypes: ['pdf'],
    allowedMultiples: true,
    isEpisodeCategory: false,
    asset_type: 'document',
    story_type: 'documents'
  },
  'fan-fiction': {
    allowedTypes: ['pdf'],
    allowedMultiples: true,
    isEpisodeCategory: false,
    asset_type: 'document',
    story_type: 'documents'
  },

  // Single PDF Categories
  'book': {
    allowedTypes: ['pdf'],
    allowedMultiples: false,
    isEpisodeCategory: false,
    asset_type: 'document',
    story_type: 'documents'
  },
  'visual-narrative': {
    allowedTypes: ['pdf'],
    allowedMultiples: false,
    isEpisodeCategory: false,
    asset_type: 'document',
    story_type: 'documents'
  },
  'article': {
    allowedTypes: ['pdf'],
    allowedMultiples: false,
    isEpisodeCategory: false,
    asset_type: 'document',
    story_type: 'documents'
  },

  // Single Video Categories
  'animation': {
    allowedTypes: ['mp4', 'mov', 'avi', 'mkv'],
    allowedMultiples: false,
    isEpisodeCategory: false,
    asset_type: 'video',
    story_type: 'documents'
  },
  'cartoon': {
    allowedTypes: ['mp4', 'mov', 'avi', 'mkv'],
    allowedMultiples: false,
    isEpisodeCategory: false,
    asset_type: 'video',
    story_type: 'documents'
  },
  'movie': {
    allowedTypes: ['mp4', 'mov', 'avi', 'mkv'],
    allowedMultiples: false,
    isEpisodeCategory: false,
    asset_type: 'video',
    story_type: 'documents'
  },
};

type StoryFieldMap = {
  [key in StoryReactionType]:
  | 'total_likes' | 'total_supports' | 'total_valuables' | 'total_funnies' | 'total_shockeds' | 'total_moveds' | 'total_triggereds';
};

interface GrammerCorrectionResultProps {
  title: string;
  description: string;
  tags: string[];
}

const storyFieldMap: StoryFieldMap = {
  like: 'total_likes',
  support: 'total_supports',
  valuable: 'total_valuables',
  funny: 'total_funnies',
  shocked: 'total_shockeds',
  moved: 'total_moveds',
  triggered: 'total_triggereds'
};

const soulpointsMap: Record<StoryReactionType, number> = {
  'like': 2,
  'support': 3,
  'valuable': 4,
  'funny': 2,
  'shocked': 1,
  'moved': 3,
  'triggered': 1
};

const parseGrammarCorrectionResult = (data: string): GrammerCorrectionResultProps => {
  const titleMatch = data.match(/\*\*Title:\*\*\s*(.+?)(?:\n|$)/);
  const descMatch = data.match(/\*\*Description:\*\*\s*([\s\S]+?)(?:\n\*\*Tags:|$)/);
  const tagsMatch = data.match(/\*\*Tags:\*\*\s*\n([\s\S]+)$/);

  const title = titleMatch ? titleMatch[1].trim() : '';
  const description = descMatch ? descMatch[1].trim().replace(/\n/g, ' ') : '';

  let tags: string[] = [];
  if (tagsMatch) {
    tags = tagsMatch[1]
      .split('\n')
      .map(line => line.replace(/^\*\s*/, '').trim())
      .filter(tag => tag.length > 0);
  }

  return { title, description, tags };
};

const getReactionDisplayName = (reactionType: StoryReactionType): string => {
  const displayNames: Record<StoryReactionType, string> = {
    'like': 'like',
    'support': 'support',
    'valuable': 'valuable reaction',
    'funny': 'funny reaction',
    'shocked': 'shocked reaction',
    'moved': 'moved reaction',
    'triggered': 'triggered reaction'
  };
  return displayNames[reactionType] || reactionType;
};

// export const createStory = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const userId = req.user?.id;
//     if (!userId) {
//       res.status(401).json({ error: "Unauthorized" });
//       return;
//     }

//     const {
//       title,
//       description,
//       tags = [],
//       category,
//       story_type,
//       thumbnail_url,
//       asset_type,
//       asset_urls,
//       episodes = [],
//       monetization_type = 'free',
//       price = 0,
//       free_documents = 0,
//       free_episodes = 0,
//       remix = false,
//       co_authors,
//       disclaimer = []
//     } = req.body;

//     if (!title?.trim() || !category?.trim() || !description?.trim() || !story_type?.trim()) {
//       res.status(400).json({
//         success: false,
//         message: 'Missing required fields: title, category, description, story_type'
//       });
//       return;
//     }

//     if (disclaimer && Array.isArray(disclaimer)) {
//       const validDisclaimerTypes = ['ai_generated', 'sponsored', 'nsfw', 'kids', 'user_generated'];

//       for (const disclaimerItem of disclaimer) {
//         if (!disclaimerItem.type || !validDisclaimerTypes.includes(disclaimerItem.type)) {
//           res.status(400).json({
//             success: false,
//             message: `Invalid disclaimer type: ${disclaimerItem.type}. Must be one of: ${validDisclaimerTypes.join(', ')}`
//           });
//           return;
//         }

//         if (typeof disclaimerItem.enabled !== 'boolean') {
//           res.status(400).json({
//             success: false,
//             message: `Disclaimer enabled must be a boolean for type: ${disclaimerItem.type}`
//           });
//           return;
//         }
//       }
//     } else if (disclaimer && !Array.isArray(disclaimer)) {
//       res.status(400).json({
//         success: false,
//         message: 'Disclaimer must be an array of objects with type and enabled properties'
//       });
//       return;
//     }

//     const content_type = story_type === 'episodes' ? 'episodes' : 'documents';
//     let finalUrls: string[] = [];

//     if (content_type === 'documents') {
//       if (asset_urls) {
//         if (Array.isArray(asset_urls)) {
//           finalUrls = asset_urls.filter(url => url?.trim());
//         } else if (typeof asset_urls === 'string') {
//           finalUrls = [asset_urls.trim()];
//         }
//       }

//       if (finalUrls.length === 0) {
//         res.status(400).json({
//           success: false,
//           message: 'Missing required fields for single asset: at least one asset URL is required'
//         });
//         return;
//       }

//       if (!asset_type?.trim()) {
//         res.status(400).json({
//           success: false,
//           message: 'Missing required field: asset_type'
//         });
//         return;
//       }

//       if (!['video', 'document'].includes(asset_type)) {
//         res.status(400).json({
//           success: false,
//           message: 'asset_type must be either "video" or "document"'
//         });
//         return;
//       }
//     } else {
//       if (episodes && episodes.length > 0) {
//         for (const [index, episode] of episodes.entries()) {
//           if (!episode.video_url?.trim()) {
//             res.status(400).json({
//               success: false,
//               message: `Episode ${index + 1} is missing required field: video_url`
//             });
//             return;
//           }
//         }
//       }
//     }

//     if (!['free', 'premium', 'subscription'].includes(monetization_type)) {
//       res.status(400).json({
//         success: false,
//         message: 'monetization_type must be one of: free, premium, subscription'
//       });
//       return;
//     }

//     if (monetization_type !== 'free' && price <= 0) {
//       res.status(400).json({
//         success: false,
//         message: 'Price must be greater than 0 for premium content'
//       });
//       return;
//     }

//     if (free_documents < 0 || free_episodes < 0) {
//       res.status(400).json({
//         success: false,
//         message: 'Free documents and episodes cannot be negative'
//       });
//       return;
//     }

//     const enabledDisclaimers = disclaimer
//       ? disclaimer.filter((d: any) => d.enabled === true)
//       : [];

//     const storyData = {
//       author_id: userId,
//       title: title.trim(),
//       description: description.trim(),
//       tags,
//       category: category.trim(),
//       story_type: story_type.trim(),
//       thumbnail_url: thumbnail_url?.trim() || null,
//       asset_urls: finalUrls,
//       asset_type: asset_type || null,
//       monetization_type,
//       price,
//       free_documents,
//       free_episodes,
//       // status: 'draft',
//       status: 'published',
//       content_type: content_type,
//       remix,
//       disclaimer: enabledDisclaimers.length > 0 ? enabledDisclaimers : null,
//       ...(co_authors && co_authors.length > 0 && { co_authors })
//     };

//     const story = await soulStoriesServices.createStory(storyData, episodes, userId);
//     res.status(201).json({
//       success: true,
//       message: 'Story created successfully',
//       story
//     });
//   } catch (error) {
//     console.error('Error creating story:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error',
//       message: 'Failed to create story'
//     });
//   }
// };

export const createStory = async (req: Request, res: Response): Promise<any> => {
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
      asset_urls,
      episodes = [],
      monetization_type = 'free',
      price = 0,
      free_documents = 0,
      free_episodes = 0,
      remix = false,
      remix_story_id,
      co_authors,
      disclaimers = []
    } = req.body;

    // Validate category exists in config
    if (!category || !categoryConfig[category as keyof typeof categoryConfig]) {
      return res.status(400).json({
        success: false,
        message: `Invalid category: ${category}. Must be one of: ${Object.keys(categoryConfig).join(', ')}`
      });
    }

    const categoryInfo = categoryConfig[category as keyof typeof categoryConfig];

    // Validate remix_story_id if provided
    if (remix_story_id) {
      const { data: remixStory, error: remixError } = await supabase
        .from('soul_stories')
        .select('id, author_id')
        .eq('id', remix_story_id)
        .single();

      if (remixError || !remixStory) {
        return res.status(400).json({
          success: false,
          message: 'Invalid remix_story_id: Story not found'
        });
      }

      if (remixStory.author_id === userId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot create a remix of your own story'
        });
      }
    }

    // Validate required fields
    if (!title?.trim() || !category?.trim() || !description?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, category, description'
      });
    }

    // Validate disclaimers
    if (disclaimers && Array.isArray(disclaimers)) {
      const validDisclaimerTypes = ['ai_generated', 'sponsored', 'nsfw', 'kids', 'user_generated'];

      for (const disclaimerItem of disclaimers) {
        if (!disclaimerItem.type || !validDisclaimerTypes.includes(disclaimerItem.type)) {
          return res.status(400).json({
            success: false,
            message: `Invalid disclaimer type: ${disclaimerItem.type}. Must be one of: ${validDisclaimerTypes.join(', ')}`
          });
        }

        if (typeof disclaimerItem.enabled !== 'boolean') {
          return res.status(400).json({
            success: false,
            message: `Disclaimer enabled must be a boolean for type: ${disclaimerItem.type}`
          });
        }
      }
    } else if (disclaimers && !Array.isArray(disclaimers)) {
      return res.status(400).json({
        success: false,
        message: 'Disclaimer must be an array of objects with type and enabled properties'
      });
    }

    const derivedAssetType = categoryInfo.asset_type;
    const derivedStoryType = categoryInfo.story_type;
    const isEpisodeCategory = categoryInfo.isEpisodeCategory;

    let finalUrls: string[] = [];
    let finalEpisodes: any[] = [];

    if (isEpisodeCategory) {
      if (!episodes || episodes.length === 0) {
        return res.status(400).json({
          success: false,
          message: `Category '${category}' requires at least one episode`
        });
      }

      for (const [index, episode] of episodes.entries()) {
        if (!episode.video_url?.trim()) {
          return res.status(400).json({
            success: false,
            message: `Episode ${index + 1} is missing required field: video_url`
          });
        }

        const videoUrl = episode.video_url.trim();
        const videoExtension = videoUrl.split('.').pop()?.toLowerCase();
        if (!videoExtension || !categoryInfo.allowedTypes.includes(videoExtension)) {
          return res.status(400).json({
            success: false,
            message: `Episode ${index + 1} has invalid video format. Allowed formats: ${categoryInfo.allowedTypes.join(', ')}`
          });
        }
      }

      finalEpisodes = episodes;
    } else {
      if (asset_urls) {
        if (Array.isArray(asset_urls)) {
          finalUrls = asset_urls.filter(url => url?.trim());
        } else if (typeof asset_urls === 'string') {
          finalUrls = [asset_urls.trim()];
        }
      }

      if (finalUrls.length === 0) {
        return res.status(400).json({
          success: false,
          message: `Category '${category}' requires at least one asset URL`
        });
      }

      for (const url of finalUrls) {
        const fileExtension = url.split('.').pop()?.toLowerCase();
        if (!fileExtension || !categoryInfo.allowedTypes.includes(fileExtension)) {
          return res.status(400).json({
            success: false,
            message: `Invalid file format for URL: ${url}. Allowed formats: ${categoryInfo.allowedTypes.join(', ')}`
          });
        }
      }

      if (!categoryInfo.allowedMultiples && finalUrls.length > 1) {
        return res.status(400).json({
          success: false,
          message: `Category '${category}' only allows a single asset`
        });
      }
    }

    if (!['free', 'premium'].includes(monetization_type)) {
      return res.status(400).json({
        success: false,
        message: 'monetization_type must be one of: free, premium'
      });
    }

    if (monetization_type !== 'free' && price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be greater than 0 for premium content'
      });
    }

    if (free_documents < 0 || free_episodes < 0) {
      return res.status(400).json({
        success: false,
        message: 'Free documents and episodes cannot be negative'
      });
    }

    let freeDocuments = free_documents;
    let freeEpisodes = free_episodes;

    if (isEpisodeCategory) {
      freeEpisodes = Math.min(free_episodes, episodes.length);
    } else {
      freeDocuments = Math.min(free_documents, finalUrls.length);
    }

    const enabledDisclaimers = disclaimers
      ? disclaimers.filter((d: any) => d.enabled === true)
      : [];

    const storyData = {
      author_id: userId,
      title: title.trim(),
      description: description.trim(),
      tags,
      category: category.trim(),
      story_type: derivedStoryType,
      thumbnail_url: thumbnail_url?.trim() || null,
      asset_urls: isEpisodeCategory ? [] : finalUrls,
      asset_type: derivedAssetType,
      monetization_type,
      price,
      free_documents: freeDocuments,
      free_episodes: freeEpisodes,
      status: 'published',
      content_type: isEpisodeCategory ? 'episodes' : 'documents',
      remix,
      remix_story_id: remix_story_id || null,
      disclaimer: enabledDisclaimers.length > 0 ? enabledDisclaimers : null,
      ...(co_authors && co_authors.length > 0 && { co_authors })
    };

    const story = await soulStoriesServices.createStory(storyData, finalEpisodes, userId);

    return res.status(201).json({
      success: true,
      message: 'Story created successfully',
      story
    });

  } catch (error) {
    console.error('Error creating story:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to create story'
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
      free_documents,
      free_episodes,
      remix,
      co_authors,
      status,
      disclaimer = []
    } = req.body;

    if (!story_id) {
      res.status(400).json({
        success: false,
        message: 'Story ID is required'
      });
      return;
    }

    const updateData: any = {};

    if (disclaimer !== undefined && disclaimer !== null) {
      if (Array.isArray(disclaimer)) {
        const validDisclaimerTypes = ['ai_generated', 'sponsored', 'nsfw', 'kids', 'user_generated'];

        for (const disclaimerItem of disclaimer) {
          if (!disclaimerItem.type || !validDisclaimerTypes.includes(disclaimerItem.type)) {
            res.status(400).json({
              success: false,
              message: `Invalid disclaimer type: ${disclaimerItem.type}. Must be one of: ${validDisclaimerTypes.join(', ')}`
            });
            return;
          }

          if (typeof disclaimerItem.enabled !== 'boolean') {
            res.status(400).json({
              success: false,
              message: `Disclaimer enabled must be a boolean for type: ${disclaimerItem.type}`
            });
            return;
          }
        }

        const enabledDisclaimers = disclaimer.filter((d: any) => d.enabled === true);
        updateData.disclaimer = enabledDisclaimers.length > 0 ? enabledDisclaimers : null;
      } else {
        res.status(400).json({
          success: false,
          message: 'Disclaimer must be an array of objects with type and enabled properties'
        });
        return;
      }
    }

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

    if (tags !== undefined) {
      updateData.tags = tags;
    }

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

    if (thumbnail_url !== undefined) {
      updateData.thumbnail_url = thumbnail_url?.trim() || null;
    }

    if (asset_url !== undefined || asset_type !== undefined) {
      if (asset_url !== undefined) {
        updateData.asset_url = asset_url?.trim() || null;
      }
      if (asset_type !== undefined) {
        updateData.asset_type = asset_type;
      }

      if (asset_type && !['video', 'document'].includes(asset_type)) {
        res.status(400).json({
          success: false,
          message: 'asset_type must be either "video" or "document"'
        });
        return;
      }
    }

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

    if (free_documents !== undefined) {
      if (free_documents < 0) {
        res.status(400).json({
          success: false,
          message: 'Free pages cannot be negative'
        });
        return;
      }
      updateData.free_documents = free_documents;
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

    if (remix !== undefined) {
      updateData.remix = remix;
    }

    if (co_authors !== undefined) {
      if (co_authors && co_authors.length > 0) {
        updateData.co_authors = co_authors;
      } else {
        updateData.co_authors = [];
      }
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    if (updateData.story_type) {
      updateData.content_type = updateData.story_type === 'episodes' ? 'episodes' : 'documents';
    }

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

export const checkContentAccess = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { storyId, contentUrl } = req.body;

    if (!storyId || !contentUrl) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: storyId and contentUrl'
      });
    }

    const contentUrls = Array.isArray(contentUrl) ? contentUrl : [contentUrl];

    const accessResults: { [key: string]: boolean } = {};

    for (const url of contentUrls) {
      const { data: purchases, error } = await supabase
        .from('user_content_purchases')
        .select('content_identifier')
        .eq('user_id', userId)
        .eq('story_id', storyId)
        .or(`content_identifier.eq.${url},content_identifier.eq.full_story`);

      if (error) {
        console.error(`Error checking access for ${url}:`, error);
        accessResults[url] = false;
        continue;
      }

      accessResults[url] = purchases && purchases.length > 0;
    }

    const { data: fullStoryPurchase } = await supabase
      .from('user_content_purchases')
      .select('id')
      .eq('user_id', userId)
      .eq('story_id', storyId)
      .eq('content_identifier', 'full_story')
      .single();

    const hasFullAccess = !!fullStoryPurchase;

    res.status(200).json({
      success: true,
      has_access: Object.values(accessResults).some(access => access),
      has_full_access: hasFullAccess,
      access_details: accessResults,
      full_story_access: hasFullAccess
    });

  } catch (error) {
    console.error('Error checking content access:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to check content access'
    });
  }
};

export const getUserStories = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: User not authenticated'
      });
      return;
    }

    if (limit > 50) {
      res.status(400).json({
        success: false,
        error: 'Limit cannot exceed 50 stories per request'
      });
      return;
    }

    // Fetch stories with pagination
    const { data: stories, error: storiesError, count } = await supabase
      .from('soul_stories')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email,
          username
        )
      `, { count: 'exact' })
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (storiesError) throw storiesError;

    if (!stories || stories.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          stories: []
        },
        pagination: {
          page,
          limit,
          total: 0,
          hasMore: false
        }
      });
      return;
    }

    const storyIds = stories.map(story => story.id);

    // Fetch episodes
    const { data: episodes, error: episodesError } = await supabase
      .from('soul_story_episodes')
      .select('*')
      .in('story_id', storyIds)
      .order('episode_number', { ascending: true });

    if (episodesError) throw episodesError;

    const storiesWithDetails = await Promise.all(
      stories.map(async (story) => {
        const { data: userReaction } = await supabase
          .from('soul_story_reactions')
          .select('type')
          .eq('user_id', userId)
          .eq('target_id', story.id)
          .eq('target_type', 'story')
          .maybeSingle();

        // Fetch user vote
        const { data: userVote } = await supabase
          .from('story_votes')
          .select('vote_type')
          .eq('user_id', userId)
          .eq('target_id', story.id)
          .eq('target_type', 'story')
          .maybeSingle();

        const { data: savedData } = await supabase
          .from('saved_stories')
          .select('id')
          .eq('user_id', userId)
          .eq('story_id', story.id)
          .maybeSingle();

        const { data: echoData } = await supabase
          .from('story_echos')
          .select('id')
          .eq('user_id', userId)
          .eq('story_id', story.id)
          .maybeSingle();

        const [
          { count: total_upvotes },
          { count: total_downvotes },
          { count: total_echos },
          { count: total_saved },
          { data: reactionsCount }
        ] = await Promise.all([
          supabase
            .from('story_votes')
            .select('*', { count: 'exact', head: true })
            .eq('target_id', story.id)
            .eq('vote_type', 'upvote')
            .eq('target_type', 'story'),

          supabase
            .from('story_votes')
            .select('*', { count: 'exact', head: true })
            .eq('target_id', story.id)
            .eq('vote_type', 'downvote')
            .eq('target_type', 'story'),

          supabase
            .from('story_echos')
            .select('*', { count: 'exact', head: true })
            .eq('story_id', story.id),

          supabase
            .from('saved_stories')
            .select('*', { count: 'exact', head: true })
            .eq('story_id', story.id),

          supabase
            .from('soul_story_reactions')
            .select('type')
            .eq('target_id', story.id)
            .eq('target_type', 'story')
        ]);

        const reactionCounts = {
          total_likes: 0,
          total_supports: 0,
          total_valuables: 0,
          total_funnies: 0,
          total_shockeds: 0,
          total_moveds: 0,
          total_triggereds: 0
        };

        if (reactionsCount) {
          reactionsCount.forEach(reaction => {
            const field = `total_${reaction.type}s`;
            if (reactionCounts.hasOwnProperty(field)) {
              reactionCounts[field as keyof typeof reactionCounts]++;
            }
          });
        }

        const storyEpisodes = episodes ? episodes.filter(ep => ep.story_id === story.id) : [];

        return {
          id: story.id,
          title: story.title,
          description: story.description,
          tags: story.tags || [],
          category: story.category,
          disclaimer: story.disclaimer,
          story_type: story.story_type,
          thumbnail_url: story.thumbnail_url,
          asset_urls: story.asset_urls || [],
          asset_type: story.asset_type,
          monetization_type: story.monetization_type,
          price: story.price,
          free_documents: story.free_documents,
          free_episodes: story.free_episodes,
          status: story.status,
          content_type: story.content_type,
          total_views: story.total_views || 0,
          is_boosted: story.is_boosted || false,
          boost_type: story.boost_type,
          boost_end_date: story.boost_end_date,
          remix: story.remix || false,
          remix_story_id: story.remix_story_id || null,
          active_status: story.active_status !== false,
          co_authors: story.co_authors || [],
          total_shares: story.total_shares || 0,
          created_at: story.created_at,
          updated_at: story.updated_at,

          // User interaction data
          user_reaction: userReaction?.type || null,
          user_vote: userVote?.vote_type || null,
          user_saved: !!savedData,
          saved_id: savedData?.id || null,
          user_echo: !!echoData,
          echo_id: echoData?.id || null,

          // Total counts
          total_upvotes: total_upvotes || 0,
          total_downvotes: total_downvotes || 0,
          total_echos: total_echos || 0,
          total_saved: total_saved || 0,

          // Reaction counts
          ...reactionCounts,

          // Author profile
          author: story.profiles ? {
            id: story.profiles.id,
            first_name: story.profiles.first_name,
            last_name: story.profiles.last_name,
            avatar_url: story.profiles.avatar_url,
            email: story.profiles.email,
            username: story.profiles.username
          } : null,

          // Episodes
          episodes: storyEpisodes.map(ep => ({
            id: ep.id,
            episode_number: ep.episode_number,
            title: ep.title,
            description: ep.description,
            video_url: ep.video_url,
            thumbnail_url: ep.thumbnail_url,
            total_views: ep.total_views || 0,
            created_at: ep.created_at
          }))
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        stories: storiesWithDetails
      },
      pagination: {
        page,
        limit,
        total: count || 0,
        hasMore: stories.length === limit
      }
    });

  } catch (error) {
    console.error('Error in getUserStories service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user stories',
      data: {
        stories: []
      }
    });
  }
};

export const getTrendingStories = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    const { data: stories, error: storiesError, count } = await supabase
      .from('soul_stories')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email,
          username
        )
      `, { count: 'exact' })
      .eq('is_boosted', true)
      .neq('status', 'draft')
      .order('boost_end_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, 6);

    console.log(stories)

    if (storiesError) throw storiesError;

    if (!stories || stories.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          stories: []
        }
      });
      return;
    }

    const storyIds = stories.map(story => story.id);

    const { data: episodes, error: episodesError } = await supabase
      .from('soul_story_episodes')
      .select('*')
      .in('story_id', storyIds)
      .order('episode_number', { ascending: true });

    if (episodesError) throw episodesError;

    const storiesWithDetails = await Promise.all(
      stories.map(async (story) => {
        let userReaction = null;
        let userVote = null;
        let savedData = null;
        let echoData = null;

        if (userId) {
          const [reactionResult, voteResult, savedResult, echoResult] = await Promise.all([
            supabase
              .from('soul_story_reactions')
              .select('type')
              .eq('user_id', userId)
              .eq('target_id', story.id)
              .eq('target_type', 'story')
              .maybeSingle(),
            supabase
              .from('post_votes')
              .select('vote_type')
              .eq('user_id', userId)
              .eq('target_id', story.id)
              .eq('target_type', 'story')
              .maybeSingle(),
            supabase
              .from('saved_soul_stories')
              .select('id')
              .eq('user_id', userId)
              .eq('soul_story_id', story.id)
              .maybeSingle(),
            supabase
              .from('story_echos')
              .select('id')
              .eq('user_id', userId)
              .eq('story_id', story.id)
              .maybeSingle()
          ]);

          userReaction = reactionResult.data;
          userVote = voteResult.data;
          savedData = savedResult.data;
          echoData = echoResult.data;
        }

        const reactionCounts = {
          total_likes: story.total_likes || 0,
          total_supports: story.total_supports || 0,
          total_valuables: story.total_valuables || 0,
          total_funnies: story.total_funnies || 0,
          total_shockeds: story.total_shockeds || 0,
          total_moveds: story.total_moveds || 0,
          total_triggereds: story.total_triggereds || 0,
        };

        const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);

        const storyEpisodes = episodes ? episodes.filter(ep => ep.story_id === story.id) : [];

        return {
          id: story.id,
          title: story.title,
          description: story.description,
          tags: story.tags || [],
          category: story.category,
          disclaimer: story.disclaimer,
          story_type: story.story_type,
          thumbnail_url: story.thumbnail_url,
          asset_urls: story.asset_urls || [],
          asset_type: story.asset_type,
          monetization_type: story.monetization_type,
          price: story.price,
          free_documents: story.free_documents,
          free_episodes: story.free_episodes,
          status: story.status,
          content_type: story.content_type,
          total_views: story.total_views || 0,
          is_boosted: story.is_boosted || false,
          boost_type: story.boost_type,
          boost_end_date: story.boost_end_date,
          remix: story.remix || false,
          active_status: story.active_status !== false,
          co_authors: story.co_authors || [],
          total_shares: story.total_shares || 0,
          created_at: story.created_at,
          updated_at: story.updated_at,

          // User-specific data (null if not authenticated)
          user_reaction: userReaction?.type || null,
          user_vote: userVote?.vote_type || null,
          user_saved: !!savedData,
          saved_id: savedData?.id || null,
          user_echo: !!echoData,
          echo_id: echoData?.id || null,

          // Engagement metrics
          total_upvotes: story.total_upvotes || 0,
          total_downvotes: story.total_downvotes || 0,
          total_echos: story.total_echos || 0,
          total_saved: story.total_saved || 0,

          // Reaction counts
          total_likes: story.total_likes || 0,
          total_supports: story.total_supports || 0,
          total_valuables: story.total_valuables || 0,
          total_funnies: story.total_funnies || 0,
          total_shockeds: story.total_shockeds || 0,
          total_moveds: story.total_moveds || 0,
          total_triggereds: story.total_triggereds || 0,

          total_reactions: totalReactions,

          // Author profile
          author: story.profiles ? {
            id: story.profiles.id,
            first_name: story.profiles.first_name,
            last_name: story.profiles.last_name,
            avatar_url: story.profiles.avatar_url,
            email: story.profiles.email,
            username: story.profiles.username
          } : null,

          // Episodes
          episodes: storyEpisodes.map(ep => ({
            id: ep.id,
            episode_number: ep.episode_number,
            title: ep.title,
            description: ep.description,
            video_url: ep.video_url,
            thumbnail_url: ep.thumbnail_url,
            total_views: ep.total_views || 0,
            created_at: ep.created_at
          }))
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        stories: storiesWithDetails
      }
    });

  } catch (error) {
    console.error('Error in getTrendingStories service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending stories',
      data: {
        stories: []
      }
    });
  }
};

export const getSoulStoryById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Story ID is required'
      });
      return;
    }

    const { data: story, error: storyError } = await supabase
      .from('soul_stories')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email,
          username
        )
      `)
      .eq('id', id)
      .single();

    if (storyError) {
      if (storyError.code === 'PGRST116') {
        res.status(404).json({
          success: false,
          error: 'Story not found'
        });
        return;
      }
      throw storyError;
    }

    // Fetch episodes for this story
    const { data: episodes, error: episodesError } = await supabase
      .from('soul_story_episodes')
      .select('*')
      .eq('story_id', id)
      .order('episode_number', { ascending: true });

    if (episodesError) throw episodesError;

    let coAuthorProfiles: any[] = [];
    if (story.co_authors && story.co_authors.length > 0) {
      const { data: coAuthorsData, error: coAuthorsError } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          avatar_url,
          email,
          username
        `)
        .in('id', story.co_authors);

      if (!coAuthorsError && coAuthorsData) {
        coAuthorProfiles = coAuthorsData;
      }
    }

    let userReaction = null;
    let userVote = null;
    let userSaved = false;
    let userEcho = false;

    if (userId) {
      const { data: reactionData } = await supabase
        .from('soul_story_reactions')
        .select('type')
        .eq('user_id', userId)
        .eq('target_id', id)
        .eq('target_type', 'story')
        .maybeSingle();

      userReaction = reactionData?.type || null;

      const { data: voteData } = await supabase
        .from('post_votes')
        .select('vote_type')
        .eq('user_id', userId)
        .eq('target_id', id)
        .eq('target_type', 'story')
        .maybeSingle();

      userVote = voteData?.vote_type || null;

      const { data: savedData } = await supabase
        .from('saved_soul_stories')
        .select('id')
        .eq('user_id', userId)
        .eq('soul_story_id', id)
        .maybeSingle();

      userSaved = !!savedData;

      const { data: echoData } = await supabase
        .from('story_echos')
        .select('id')
        .eq('user_id', userId)
        .eq('story_id', id)
        .maybeSingle();

      userEcho = !!echoData;
    }

    const reactionCounts = {
      total_likes: story.total_likes || 0,
      total_supports: story.total_supports || 0,
      total_valuables: story.total_valuables || 0,
      total_funnies: story.total_funnies || 0,
      total_shockeds: story.total_shockeds || 0,
      total_moveds: story.total_moveds || 0,
      total_triggereds: story.total_triggereds || 0,
    };

    const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);

    const completeStory = {
      id: story.id,
      title: story.title,
      description: story.description,
      disclaimer: story.disclaimer,
      tags: story.tags || [],
      category: story.category,
      story_type: story.story_type,
      thumbnail_url: story.thumbnail_url,
      asset_urls: story.asset_urls || [],
      asset_type: story.asset_type,
      monetization_type: story.monetization_type,
      price: story.price,
      free_documents: story.free_documents,
      free_episodes: story.free_episodes,
      status: story.status,
      content_type: story.content_type,
      total_views: story.total_views || 0,
      is_boosted: story.is_boosted || false,
      boost_type: story.boost_type,
      boost_end_date: story.boost_end_date,
      remix: story.remix || false,
      remix_story_id: story.remix_story_id || null,
      active_status: story.active_status !== false,
      co_authors: story.co_authors || [],
      total_shares: story.total_shares || 0,
      created_at: story.created_at,
      updated_at: story.updated_at,

      // User interaction data
      user_reaction: userReaction,
      user_vote: userVote,
      user_saved: userSaved,
      user_echo: userEcho,

      // Total counts
      total_upvotes: story.total_upvotes || 0,
      total_downvotes: story.total_downvotes || 0,
      total_echos: story.total_echos || 0,
      total_saved: story.total_saved || 0,
      total_comments: story.total_comments || 0,

      // Individual reaction counts
      total_likes: story.total_likes || 0,
      total_supports: story.total_supports || 0,
      total_valuables: story.total_valuables || 0,
      total_funnies: story.total_funnies || 0,
      total_shockeds: story.total_shockeds || 0,
      total_moveds: story.total_moveds || 0,
      total_triggereds: story.total_triggereds || 0,

      // Computed totals for convenience
      total_reactions: totalReactions,
      vote_score: (story.total_upvotes || 0) - (story.total_downvotes || 0),

      // Author profile
      author: story.profiles ? {
        id: story.profiles.id,
        first_name: story.profiles.first_name,
        last_name: story.profiles.last_name,
        avatar_url: story.profiles.avatar_url,
        email: story.profiles.email,
        username: story.profiles.username
      } : null,

      // Co-author profiles
      co_author_profiles: coAuthorProfiles!.map(profile => ({
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        avatar_url: profile.avatar_url,
        email: profile.email,
        username: profile.username
      })),

      episodes: episodes ? episodes.map(episode => ({
        id: episode.id,
        story_id: episode.story_id,
        episode_number: episode.episode_number,
        title: episode.title,
        description: episode.description,
        video_url: episode.video_url,
        thumbnail_url: episode.thumbnail_url,
        duration: episode.duration,
        file_size: episode.file_size,
        total_views: episode.total_views || 0,
        is_published: episode.is_published !== false,
        created_at: episode.created_at,
        updated_at: episode.updated_at
      })) : [],

      metadata: {
        has_episodes: episodes && episodes.length > 0,
        total_episodes: episodes ? episodes.length : 0,
        is_video_content: ['video-drama', 'animation', 'ai-movie'].includes(story.category),
        is_episodic_content: ['serial-fiction', 'webtoon', 'comic', 'manga'].includes(story.category),
        can_remix: story.remix,
        is_owner: userId ? story.author_id === userId : false,
        is_co_author: userId ? story.co_authors?.includes(userId) || false : false,
        total_co_authors: coAuthorProfiles.length
      }
    };

    if (userId && userId !== story.author_id) {
      supabase
        .from('soul_stories')
        .update({
          total_views: (story.total_views || 0) + 1
        })
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.error('Error incrementing view count:', error);
          }
        });
    }

    res.status(200).json({
      success: true,
      data: {
        story: completeStory
      },
      message: 'Story fetched successfully'
    });

  } catch (error) {
    console.error('Error in getSoulStoryById service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch story details'
    });
  }
};

export const updateSoulStoryReaction = async (
  req: Request<{ soulStoryId: string }, {}, { type: StoryReactionType }>,
  res: Response
): Promise<any> => {
  const { soulStoryId } = req.params;
  const { type } = req.body;
  const { id: user_id } = req.user!;
  const { data: actorProfile, error: actorProfileError } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user_id)
    .single();
  if (!user_id || !storyFieldMap[type]) {
    return res.status(400).json({ error: 'Invalid user or reaction type.' });
  }

  const targetType = 'story';

  const { data: existing, error: fetchError } = await supabase
    .from('soul_story_reactions')
    .select('*')
    .eq('user_id', user_id)
    .eq('target_id', soulStoryId)
    .eq('target_type', targetType)
    .maybeSingle();

  if (fetchError) {
    return res.status(500).json({ error: fetchError.message });
  }

  const { data: soulStoryData, error: soulStoryError } = await supabase
    .from('soul_stories')
    .select('author_id, total_likes, total_supports, total_valuables, total_funnies, total_shockeds, total_moveds, total_triggereds')
    .eq('id', soulStoryId)
    .single();

  if (soulStoryError || !soulStoryData) {
    return res.status(404).json({ error: 'Soul story not found!' });
  }

  const shouldSendNotification = soulStoryData.author_id !== user_id;

  let authorProfile = null;
  if (shouldSendNotification) {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', soulStoryData.author_id)
      .single();

    if (!profileError && profileData) {
      authorProfile = profileData;
    }
  }

  const updates = {
    total_likes: soulStoryData.total_likes ?? 0,
    total_supports: soulStoryData.total_supports ?? 0,
    total_valuables: soulStoryData.total_valuables ?? 0,
    total_funnies: soulStoryData.total_funnies ?? 0,
    total_shockeds: soulStoryData.total_shockeds ?? 0,
    total_moveds: soulStoryData.total_moveds ?? 0,
    total_triggereds: soulStoryData.total_triggereds ?? 0,
  };

  if (existing) {
    if (existing.type === type) {
      // Remove reaction
      const field = storyFieldMap[type];
      updates[field] = Math.max(0, updates[field] - 1);

      const { error: deleteError } = await supabase
        .from('soul_story_reactions')
        .delete()
        .eq('id', existing.id);

      if (deleteError) return res.status(500).json({ error: deleteError.message });

      const { error: updateSoulStoryError } = await supabase
        .from('soul_stories')
        .update({ [field]: updates[field] })
        .eq('id', soulStoryId);

      if (updateSoulStoryError) return res.status(500).json({ error: updateSoulStoryError.message });

      if (shouldSendNotification && authorProfile) {
        await sendNotification({
          recipientEmail: authorProfile.email,
          recipientUserId: soulStoryData.author_id,
          actorUserId: user_id,
          threadId: soulStoryId,
          message: `_${getReactionDisplayName(type)}_ reaction was removed from your soul story.`,
          type: 'soul_story_reaction_removed',
          metadata: {
            reaction_type: type,
            soul_story_id: soulStoryId,
            actor_user_id: user_id
          }
        });
      }

      return res.status(200).json({ message: `${type} removed from soul story!` });
    }

    // Update reaction type
    const prevField = storyFieldMap[existing.type as StoryReactionType];
    const currentField = storyFieldMap[type];

    updates[prevField] = Math.max(0, updates[prevField] - 1);
    updates[currentField] += 1;

    const { error: updateReactionError } = await supabase
      .from('soul_story_reactions')
      .update({ type, updated_by: user_id })
      .eq('id', existing.id);

    if (updateReactionError) return res.status(500).json({ error: updateReactionError.message });

    const { error: updateSoulStoryError } = await supabase
      .from('soul_stories')
      .update({
        [prevField]: updates[prevField],
        [currentField]: updates[currentField],
      })
      .eq('id', soulStoryId);

    if (updateSoulStoryError) return res.status(500).json({ error: updateSoulStoryError.message });

    if (shouldSendNotification && authorProfile) {
      await sendNotification({
        recipientEmail: authorProfile.email,
        recipientUserId: soulStoryData.author_id,
        actorUserId: user_id,
        threadId: soulStoryId,
        message: `**${actorProfile?.first_name} ${actorProfile?.last_name}** changed their reaction to _${getReactionDisplayName(type)}_ on your soul story.`,
        type: 'soul_story_reaction_updated',
        metadata: {
          previous_reaction_type: existing.type,
          new_reaction_type: type,
          soul_story_id: soulStoryId,
          actor_user_id: user_id
        }
      });
    }

    return res.status(200).json({ message: `Soul story reaction updated to ${type}!` });
  } else {
    // Add new reaction
    const field = storyFieldMap[type];
    updates[field] += 1;

    const { error: insertError } = await supabase
      .from('soul_story_reactions')
      .insert([{
        user_id,
        target_id: soulStoryId,
        target_type: targetType,
        type
      }]);

    if (insertError) return res.status(500).json({ error: insertError.message });

    const { error: updateSoulStoryError } = await supabase
      .from('soul_stories')
      .update({ [field]: updates[field] })
      .eq('id', soulStoryId);

    if (updateSoulStoryError) return res.status(500).json({ error: updateSoulStoryError.message });

    if (shouldSendNotification && authorProfile) {
      const soulpoints = soulpointsMap[type] || 0;

      if (soulpoints > 0) {
        const { error: soulpointsError } = await supabase.rpc('increment_soulpoints', {
          p_user_id: soulStoryData.author_id,
          p_points: soulpoints
        });

        if (soulpointsError) {
          console.error('Error updating SoulPoints:', soulpointsError);
        }
      }

      await sendNotification({
        recipientEmail: authorProfile.email,
        recipientUserId: soulStoryData.author_id,
        actorUserId: user_id,
        threadId: soulStoryId,
        message: `**${actorProfile?.first_name} ${actorProfile?.last_name}** reacted with _${getReactionDisplayName(type)}_ on your soul story. ${soulpoints > 0 ? `+${soulpoints} SoulPoints (SP) added!` : ''}`,
        type: 'soul_story_reaction_added',
        metadata: {
          reaction_type: type,
          soul_story_id: soulStoryId,
          actor_user_id: user_id,
          soulpoints
        }
      });
    }

    return res.status(200).json({ message: `${type} added to soul story!` });
  }
};

export const getStories = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;
    const category = req.query.category as string;

    if (limit > 50) {
      res.status(400).json({
        success: false,
        error: 'Limit cannot exceed 50 stories per request'
      });
      return;
    }

    const from = page * limit;
    const to = from + limit - 1;

    let supabaseQuery = supabase
      .from('soul_stories')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email,
          username
        )
      `, { count: 'exact' })
      .eq('status', 'published');

    if (category && category !== 'all') {
      supabaseQuery = supabaseQuery.eq('category', category);
    }

    const { data: stories, error: storiesError, count } = await supabaseQuery
      .order('created_at', { ascending: false })
      .range(from, to);

    if (storiesError) {
      console.error('Supabase stories error:', storiesError);

      if (storiesError.code === 'PGRST103') {
        res.status(200).json({
          success: true,
          data: {
            stories: []
          },
          pagination: {
            page,
            limit,
            total: 0,
            hasMore: false
          }
        });
        return;
      }
      throw storiesError;
    }

    if (!stories || stories.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          stories: []
        },
        pagination: {
          page,
          limit,
          total: count || 0,
          hasMore: false
        }
      });
      return;
    }

    const storyIds = stories.map(story => story.id);

    const { data: episodes, error: episodesError } = await supabase
      .from('soul_story_episodes')
      .select('*')
      .in('story_id', storyIds)
      .order('episode_number', { ascending: true });

    if (episodesError) {
      console.error('Supabase episodes error:', episodesError);
      throw episodesError;
    }

    const storiesWithDetails = await Promise.all(
      stories.map(async (story) => {
        try {

          const [
            userReactionResult,
            userVoteResult,
            savedDataResult,
            echoDataResult,
            upvotesResult,
            downvotesResult,
            echosResult,
            savedResult,
            reactionsResult
          ] = await Promise.all([
            supabase
              .from('soul_story_reactions')
              .select('type')
              .eq('user_id', userId)
              .eq('target_id', story.id)
              .eq('target_type', 'story')
              .maybeSingle(),

            supabase
              .from('story_votes')
              .select('vote_type')
              .eq('user_id', userId)
              .eq('target_id', story.id)
              .eq('target_type', 'story')
              .maybeSingle(),

            supabase
              .from('saved_stories')
              .select('id')
              .eq('user_id', userId)
              .eq('story_id', story.id)
              .maybeSingle(),

            supabase
              .from('story_echos')
              .select('id')
              .eq('user_id', userId)
              .eq('story_id', story.id)
              .maybeSingle(),

            supabase
              .from('story_votes')
              .select('*', { count: 'exact', head: true })
              .eq('target_id', story.id)
              .eq('vote_type', 'upvote')
              .eq('target_type', 'story'),

            supabase
              .from('story_votes')
              .select('*', { count: 'exact', head: true })
              .eq('target_id', story.id)
              .eq('vote_type', 'downvote')
              .eq('target_type', 'story'),

            supabase
              .from('story_echos')
              .select('*', { count: 'exact', head: true })
              .eq('story_id', story.id),

            supabase
              .from('saved_stories')
              .select('*', { count: 'exact', head: true })
              .eq('story_id', story.id),

            supabase
              .from('soul_story_reactions')
              .select('type')
              .eq('target_id', story.id)
              .eq('target_type', 'story')
          ]);

          const reactionCounts = {
            total_likes: 0,
            total_supports: 0,
            total_valuables: 0,
            total_funnies: 0,
            total_shockeds: 0,
            total_moveds: 0,
            total_triggereds: 0
          };

          if (reactionsResult.data) {
            reactionsResult.data.forEach(reaction => {
              const field = `total_${reaction.type}s`;
              if (reactionCounts.hasOwnProperty(field)) {
                reactionCounts[field as keyof typeof reactionCounts]++;
              }
            });
          }

          const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);
          const storyEpisodes = episodes ? episodes.filter(ep => ep.story_id === story.id) : [];

          return {
            id: story.id,
            title: story.title,
            description: story.description,
            tags: story.tags || [],
            category: story.category,
            disclaimer: story.disclaimer,
            story_type: story.story_type,
            thumbnail_url: story.thumbnail_url,
            asset_urls: story.asset_urls || [],
            asset_type: story.asset_type,
            monetization_type: story.monetization_type,
            price: story.price,
            free_documents: story.free_documents,
            free_episodes: story.free_episodes,
            status: story.status,
            content_type: story.content_type,
            total_views: story.total_views || 0,
            is_boosted: story.is_boosted || false,
            boost_type: story.boost_type,
            boost_end_date: story.boost_end_date,
            remix: story.remix || false,
            remix_story_id: story.remix_story_id || null,
            active_status: story.active_status !== false,
            co_authors: story.co_authors || [],
            total_shares: story.total_shares || 0,
            created_at: story.created_at,
            updated_at: story.updated_at,

            // User interaction data
            user_reaction: userReactionResult.data?.type || null,
            user_vote: userVoteResult.data?.vote_type || null,
            user_saved: !!savedDataResult.data,
            saved_id: savedDataResult.data?.id || null,
            user_echo: !!echoDataResult.data,
            echo_id: echoDataResult.data?.id || null,

            // Total counts
            total_upvotes: upvotesResult.count || 0,
            total_downvotes: downvotesResult.count || 0,
            total_echos: echosResult.count || 0,
            total_saved: savedResult.count || 0,

            // Reaction counts
            ...reactionCounts,
            total_reactions: totalReactions,

            // Author profile
            author: story.profiles ? {
              id: story.profiles.id,
              first_name: story.profiles.first_name,
              last_name: story.profiles.last_name,
              avatar_url: story.profiles.avatar_url,
              email: story.profiles.email,
              username: story.profiles.username
            } : null,

            // Episodes
            episodes: storyEpisodes.map(ep => ({
              id: ep.id,
              episode_number: ep.episode_number,
              title: ep.title,
              description: ep.description,
              video_url: ep.video_url,
              thumbnail_url: ep.thumbnail_url,
              total_views: ep.total_views || 0,
              created_at: ep.created_at
            }))
          };
        } catch (storyError) {
          console.error(`Error processing story ${story.id}:`, storyError);

          return {
            id: story.id,
            title: story.title,
            description: story.description,
            tags: story.tags || [],
            category: story.category,
            story_type: story.story_type,
            thumbnail_url: story.thumbnail_url,
            asset_urls: story.asset_urls || [],
            asset_type: story.asset_type,
            status: story.status,
            content_type: story.content_type,
            total_views: story.total_views || 0,
            is_boosted: story.is_boosted || false,
            created_at: story.created_at,
            updated_at: story.updated_at,
            author: story.profiles ? {
              id: story.profiles.id,
              first_name: story.profiles.first_name,
              last_name: story.profiles.last_name,
              avatar_url: story.profiles.avatar_url,
              username: story.profiles.username
            } : null,
            episodes: []
          };
        }
      })
    );

    console.log('Successfully processed stories:', storiesWithDetails.length);

    res.status(200).json({
      success: true,
      data: {
        stories: storiesWithDetails
      },
      pagination: {
        page,
        limit,
        total: count || 0,
        hasMore: (from + limit) < (count || 0)
      }
    });

  } catch (error) {
    console.error('Error in getStories:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch stories',
      data: {
        stories: []
      }
    });
  }
};

export const searchStories = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { query, category, page = 0, limit = 10 } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Unauthorized: User not authenticated"
      });
      return;
    }

    if (limit > 50) {
      res.status(400).json({
        success: false,
        error: 'Limit cannot exceed 50 stories per request'
      });
      return;
    }

    const from = page * limit;
    const to = from + limit - 1;

    let supabaseQuery = supabase
      .from('soul_stories')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email,
          username
        )
      `, { count: 'exact' })
      .eq('status', 'published')
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,tags.cs.{${query}}`);

    if (category && category !== 'all') {
      supabaseQuery = supabaseQuery.eq('category', category);
    }

    const { data: stories, error: storiesError, count } = await supabaseQuery
      .order('created_at', { ascending: false })
      .range(from, to);

    if (storiesError) {
      console.error('Supabase search error:', storiesError);

      if (storiesError.code === 'PGRST103') {
        res.status(200).json({
          success: true,
          data: {
            stories: []
          },
          pagination: {
            page,
            limit,
            total: 0,
            hasMore: false
          }
        });
        return;
      }
      throw storiesError;
    }

    if (!stories || stories.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          stories: []
        },
        pagination: {
          page,
          limit,
          total: count || 0,
          hasMore: false
        }
      });
      return;
    }

    const storyIds = stories.map(story => story.id);

    const { data: episodes, error: episodesError } = await supabase
      .from('soul_story_episodes')
      .select('*')
      .in('story_id', storyIds)
      .order('episode_number', { ascending: true });

    if (episodesError) {
      console.error('Supabase episodes error:', episodesError);
      throw episodesError;
    }

    const storiesWithDetails = await Promise.all(
      stories.map(async (story) => {
        try {
          const [
            userReactionResult,
            userVoteResult,
            savedDataResult,
            echoDataResult,
            upvotesResult,
            downvotesResult,
            echosResult,
            savedResult,
            reactionsResult
          ] = await Promise.all([
            supabase
              .from('soul_story_reactions')
              .select('type')
              .eq('user_id', userId)
              .eq('target_id', story.id)
              .eq('target_type', 'story')
              .maybeSingle(),

            supabase
              .from('story_votes')
              .select('vote_type')
              .eq('user_id', userId)
              .eq('target_id', story.id)
              .eq('target_type', 'story')
              .maybeSingle(),

            supabase
              .from('saved_stories')
              .select('id')
              .eq('user_id', userId)
              .eq('story_id', story.id)
              .maybeSingle(),

            supabase
              .from('story_echos')
              .select('id')
              .eq('user_id', userId)
              .eq('story_id', story.id)
              .maybeSingle(),

            supabase
              .from('story_votes')
              .select('*', { count: 'exact', head: true })
              .eq('target_id', story.id)
              .eq('vote_type', 'upvote')
              .eq('target_type', 'story'),

            supabase
              .from('story_votes')
              .select('*', { count: 'exact', head: true })
              .eq('target_id', story.id)
              .eq('vote_type', 'downvote')
              .eq('target_type', 'story'),

            supabase
              .from('story_echos')
              .select('*', { count: 'exact', head: true })
              .eq('story_id', story.id),

            supabase
              .from('saved_stories')
              .select('*', { count: 'exact', head: true })
              .eq('story_id', story.id),

            supabase
              .from('soul_story_reactions')
              .select('type')
              .eq('target_id', story.id)
              .eq('target_type', 'story')
          ]);

          const reactionCounts = {
            total_likes: 0,
            total_supports: 0,
            total_valuables: 0,
            total_funnies: 0,
            total_shockeds: 0,
            total_moveds: 0,
            total_triggereds: 0
          };

          if (reactionsResult.data) {
            reactionsResult.data.forEach(reaction => {
              const field = `total_${reaction.type}s`;
              if (reactionCounts.hasOwnProperty(field)) {
                reactionCounts[field as keyof typeof reactionCounts]++;
              }
            });
          }

          const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);
          const storyEpisodes = episodes ? episodes.filter(ep => ep.story_id === story.id) : [];

          return {
            id: story.id,
            title: story.title,
            description: story.description,
            tags: story.tags || [],
            category: story.category,
            story_type: story.story_type,
            thumbnail_url: story.thumbnail_url,
            asset_urls: story.asset_urls || [],
            asset_type: story.asset_type,
            monetization_type: story.monetization_type,
            price: story.price,
            free_documents: story.free_documents,
            free_episodes: story.free_episodes,
            status: story.status,
            content_type: story.content_type,
            total_views: story.total_views || 0,
            is_boosted: story.is_boosted || false,
            boost_type: story.boost_type,
            boost_end_date: story.boost_end_date,
            remix: story.remix || false,
            remix_story_id: story.remix_story_id || null,
            active_status: story.active_status !== false,
            co_authors: story.co_authors || [],
            total_shares: story.total_shares || 0,
            created_at: story.created_at,
            updated_at: story.updated_at,

            // User interaction data
            user_reaction: userReactionResult.data?.type || null,
            user_vote: userVoteResult.data?.vote_type || null,
            user_saved: !!savedDataResult.data,
            saved_id: savedDataResult.data?.id || null,
            user_echo: !!echoDataResult.data,
            echo_id: echoDataResult.data?.id || null,

            // Total counts
            total_upvotes: upvotesResult.count || 0,
            total_downvotes: downvotesResult.count || 0,
            total_echos: echosResult.count || 0,
            total_saved: savedResult.count || 0,

            // Reaction counts
            ...reactionCounts,
            total_reactions: totalReactions,

            // Author profile
            author: story.profiles ? {
              id: story.profiles.id,
              first_name: story.profiles.first_name,
              last_name: story.profiles.last_name,
              avatar_url: story.profiles.avatar_url,
              email: story.profiles.email,
              username: story.profiles.username
            } : null,

            // Episodes
            episodes: storyEpisodes.map(ep => ({
              id: ep.id,
              episode_number: ep.episode_number,
              title: ep.title,
              description: ep.description,
              video_url: ep.video_url,
              thumbnail_url: ep.thumbnail_url,
              total_views: ep.total_views || 0,
              created_at: ep.created_at
            }))
          };
        } catch (storyError) {
          console.error(`Error processing story ${story.id}:`, storyError);
          return {
            id: story.id,
            title: story.title,
            description: story.description,
            tags: story.tags || [],
            category: story.category,
            story_type: story.story_type,
            thumbnail_url: story.thumbnail_url,
            asset_urls: story.asset_urls || [],
            asset_type: story.asset_type,
            status: story.status,
            content_type: story.content_type,
            total_views: story.total_views || 0,
            is_boosted: story.is_boosted || false,
            created_at: story.created_at,
            updated_at: story.updated_at,
            author: story.profiles ? {
              id: story.profiles.id,
              first_name: story.profiles.first_name,
              last_name: story.profiles.last_name,
              avatar_url: story.profiles.avatar_url,
              username: story.profiles.username
            } : null,
            episodes: []
          };
        }
      })
    );

    res.status(200).json({
      success: true,
      data: {
        stories: storiesWithDetails
      },
      pagination: {
        page,
        limit,
        total: count || 0,
        hasMore: (from + limit) < (count || 0)
      }
    });

  } catch (error) {
    console.error('Error in searchStories:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to search stories',
      data: {
        stories: []
      }
    });
  }
};

// export const purchaseStory = async (req: Request, res: Response): Promise<any> => {
//   try {
//     const userId = req.user?.id;
//     if (!userId) {
//       res.status(401).json({ error: 'Unauthorized' });
//       return;
//     }

//     const { storyId } = req.body;

//     if (!storyId) {
//       res.status(400).json({
//         success: false,
//         message: 'Missing required field: storyId'
//       });
//       return;
//     }

//     const { data: userProfile, error: profileError } = await supabase
//       .from('profiles')
//       .select('user_level')
//       .eq('id', userId)
//       .single();

//     if (profileError || !userProfile) {
//       throw new Error('User profile not found');
//     }

//     if (!userProfile.user_level || userProfile.user_level < 1) {
//       return res.status(403).json({
//         success: false,
//         message: 'Not allowed. User level too low.'
//       });
//     }

//     const { data: story, error: storyError } = await supabase
//       .from('soul_stories')
//       .select(`
//         *,
//         episodes:soul_story_episodes(*)
//       `)
//       .eq('id', storyId)
//       .single();

//     if (storyError || !story) {
//       console.error('Story fetch error:', storyError);
//       return res.status(404).json({
//         success: false,
//         message: 'Story not found'
//       });
//     }

//     if (story.monetization_type === 'free' || story.price === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'This story is free and does not require purchase'
//       });
//     }

//     const { data: existingPurchase, error: purchaseError } = await supabase
//       .from('user_content_purchases')
//       .select('*')
//       .eq('user_id', userId)
//       .eq('story_id', storyId)
//       .single();

//     if (existingPurchase) {
//       return res.status(400).json({
//         success: false,
//         message: 'You have already purchased this story'
//       });
//     }

//     const totalPrice = story.price;

//     const { data: userCoins, error: userError } = await supabase
//       .from('anamcoins')
//       .select('available_coins, spent_coins, total_coins')
//       .eq('user_id', userId)
//       .single();

//     if (userError || !userCoins) {
//       throw new Error('User coins account not found');
//     }

//     if (userCoins.available_coins < totalPrice) {
//       return res.status(400).json({
//         success: false,
//         message: `Insufficient coins. Need ${totalPrice}, have ${userCoins.available_coins}`
//       });
//     }

//     let totalPages = 0;
//     let totalEpisodes = 0;
//     let accessibleEpisodes: string[] = [];

//     if (story.asset_type === 'document') {
//       totalPages = story.asset_urls?.length || story.free_documents || 0;
//     } else if (story.asset_type === 'video' && story.story_type === 'episodes') {
//       totalEpisodes = story.episodes?.length || 0;
//       accessibleEpisodes = story.episodes?.map((ep: any) => ep.video_url) || [];
//     }

//     const { error: userUpdateError } = await supabase
//       .from('anamcoins')
//       .update({
//         available_coins: userCoins.available_coins - totalPrice,
//         spent_coins: (userCoins.spent_coins || 0) + totalPrice,
//         updated_at: new Date().toISOString()
//       })
//       .eq('user_id', userId);

//     if (userUpdateError) {
//       throw new Error('Failed to update user coins');
//     }

//     // FIXED: Removed 'purchase_type' column and fixed 'purchase_data' typo
//     const { data: purchaseData, error: purchaseCreateError } = await supabase
//       .from('user_content_purchases')
//       .insert({
//         user_id: userId,
//         story_id: storyId,
//         content_type: story.asset_type,
//         content_identifier: 'full_story',
//         coins_paid: totalPrice,
//         author_revenue: totalPrice,
//         highest_page_access: totalPages,
//         accessible_episode_urls: accessibleEpisodes,
//         total_coins_spent: totalPrice,
//         created_at: new Date().toISOString(),
//         updated_at: new Date().toISOString()
//       })
//       .select()
//       .single();

//     if (purchaseCreateError) {
//       // Rollback coin deduction if purchase fails
//       await supabase
//         .from('anamcoins')
//         .update({
//           available_coins: userCoins.available_coins,
//           spent_coins: userCoins.spent_coins,
//           updated_at: new Date().toISOString()
//         })
//         .eq('user_id', userId);

//       throw new Error(`Failed to create purchase record: ${purchaseCreateError.message}`);
//     }

//     const hasCoAuthors = story.co_authors &&
//       Array.isArray(story.co_authors) &&
//       story.co_authors.length > 0;

//     if (hasCoAuthors) {
//       const allAuthors = [story.author_id, ...story.co_authors];
//       const revenuePerAuthor = Math.floor(totalPrice / allAuthors.length);
//       const remainder = totalPrice % allAuthors.length;

//       for (let i = 0; i < allAuthors.length; i++) {
//         const authorId = allAuthors[i];
//         const coinAmount = revenuePerAuthor + (i === 0 ? remainder : 0);

//         const { data: authorCoins, error: authorError } = await supabase
//           .from('anamcoins')
//           .select('available_coins, total_coins')
//           .eq('user_id', authorId)
//           .single();

//         if (authorError || !authorCoins) {
//           console.error(`Author ${authorId} coins account not found`);
//           continue;
//         }

//         const { error: authorUpdateError } = await supabase
//           .from('anamcoins')
//           .update({
//             available_coins: authorCoins.available_coins + coinAmount,
//             total_coins: authorCoins.total_coins + coinAmount,
//             updated_at: new Date().toISOString()
//           })
//           .eq('user_id', authorId);

//         if (authorUpdateError) {
//           console.error(`Failed to update coins for author ${authorId}`);
//         }
//       }

//       // FIXED: Removed co_authors_revenue column since it doesn't exist in schema
//       await supabase
//         .from('user_content_purchases')
//         .update({
//           author_revenue: revenuePerAuthor + remainder
//         })
//         .eq('id', purchaseData.id);
//     } else {
//       const { data: authorCoins, error: authorError } = await supabase
//         .from('anamcoins')
//         .select('available_coins, total_coins')
//         .eq('user_id', story.author_id)
//         .single();

//       if (authorError || !authorCoins) {
//         console.error('Author coins account not found');
//       } else {
//         const { error: authorUpdateError } = await supabase
//           .from('anamcoins')
//           .update({
//             available_coins: authorCoins.available_coins + totalPrice,
//             total_coins: authorCoins.total_coins + totalPrice,
//             updated_at: new Date().toISOString()
//           })
//           .eq('user_id', story.author_id);

//         if (authorUpdateError) {
//           console.error('Failed to update author coins');
//         }
//       }
//     }

//     await supabase
//       .from('soul_stories')
//       .update({
//         total_saved: (story.total_saved || 0) + 1,
//         updated_at: new Date().toISOString()
//       })
//       .eq('id', storyId);

//     return res.status(200).json({
//       success: true,
//       message: 'Story purchased successfully',
//       purchase: {
//         id: purchaseData.id,
//         story_id: storyId,
//         story_title: story.title,
//         coins_paid: totalPrice,
//         access_granted: {
//           full_access: true,
//           total_pages: totalPages,
//           total_episodes: totalEpisodes,
//           accessible_episodes: accessibleEpisodes.length
//         },
//         purchased_at: purchaseData.created_at
//       },
//       remaining_coins: userCoins.available_coins - totalPrice
//     });

//   } catch (error) {
//     console.error('Error in purchaseStory controller:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error',
//       message: error instanceof Error ? error.message : 'Failed to purchase story'
//     });
//   }
// };

export const purchaseStory = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { storyId, contentIdentifier = 'full_story', specificUrl, purchaseType = 'full' } = req.body;

    if (!storyId) {
      res.status(400).json({
        success: false,
        message: 'Missing required field: storyId'
      });
      return;
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('user_level')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      throw new Error('User profile not found');
    }

    if (!userProfile.user_level || userProfile.user_level < 1) {
      return res.status(403).json({
        success: false,
        message: 'Not allowed. User level too low.'
      });
    }

    const { data: story, error: storyError } = await supabase
      .from('soul_stories')
      .select(`
        *,
        episodes:soul_story_episodes(*),
        remix_story:soul_stories!remix_story_id(id, author_id, title)
      `)
      .eq('id', storyId)
      .single();

    if (storyError || !story) {
      console.error('Story fetch error:', storyError);
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    if (story.monetization_type === 'free' || story.price === 0) {
      return res.status(400).json({
        success: false,
        message: 'This story is free and does not require purchase'
      });
    }

    // Check existing purchase
    let existingPurchaseQuery = supabase
      .from('user_content_purchases')
      .select('*')
      .eq('user_id', userId)
      .eq('story_id', storyId);

    if (specificUrl) {
      existingPurchaseQuery = existingPurchaseQuery.eq('content_identifier', specificUrl);
    }

    const { data: existingPurchase, error: purchaseError } = await existingPurchaseQuery;

    if (existingPurchase && existingPurchase.length > 0) {
      return res.status(400).json({
        success: false,
        message: specificUrl ? 'You have already purchased this content' : 'You have already purchased this story'
      });
    }

    // Calculate price and access details
    let totalPrice = story.price;
    let contentIdentifierToUse = contentIdentifier;
    let accessibleUrls: string[] = [];
    let contentType = 'story';

    if (specificUrl && purchaseType === 'individual') {
      // Individual content purchase
      if (story.asset_type === 'document' && story.asset_urls?.includes(specificUrl)) {
        totalPrice = Math.ceil(story.price / Math.max(story.asset_urls.length, 1));
        contentIdentifierToUse = specificUrl;
        accessibleUrls = [specificUrl];
        contentType = 'document'; // Individual document purchase
      } else if (story.asset_type === 'video' && story.story_type === 'episodes') {
        const targetEpisode = story.episodes?.find((ep: any) => ep.video_url === specificUrl);
        if (targetEpisode) {
          totalPrice = Math.ceil(story.price / Math.max(story.episodes.length, 1));
          contentIdentifierToUse = specificUrl;
          accessibleUrls = [specificUrl];
          contentType = 'episode'; // Individual episode purchase
        }
      }
    } else {
      // Full story purchase - always use 'story' content type
      if (story.asset_type === 'document') {
        accessibleUrls = story.asset_urls || [];
        contentType = 'story'; // Full document story
      } else if (story.asset_type === 'video' && story.story_type === 'episodes') {
        accessibleUrls = story.episodes?.map((ep: any) => ep.video_url) || [];
        contentType = 'story'; // Full video story
      }
    }

    if (totalPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid price for this content'
      });
    }

    // Check user coins
    const { data: userCoins, error: userError } = await supabase
      .from('anamcoins')
      .select('available_coins, spent_coins, total_coins')
      .eq('user_id', userId)
      .single();

    if (userError || !userCoins) {
      throw new Error('User coins account not found');
    }

    if (userCoins.available_coins < totalPrice) {
      return res.status(400).json({
        success: false,
        message: `Insufficient coins. Need ${totalPrice}, have ${userCoins.available_coins}`
      });
    }

    // Deduct coins from user
    const { error: userUpdateError } = await supabase
      .from('anamcoins')
      .update({
        available_coins: userCoins.available_coins - totalPrice,
        spent_coins: (userCoins.spent_coins || 0) + totalPrice,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (userUpdateError) {
      throw new Error('Failed to update user coins');
    }

    // Create purchase record with proper content types
    const purchaseDataToInsert: any = {
      user_id: userId,
      story_id: storyId,
      content_type: contentType, // 'document', 'episode', or 'story'
      content_identifier: contentIdentifierToUse,
      coins_paid: totalPrice,
      author_revenue: totalPrice,
      total_coins_spent: totalPrice,
      purchase_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add conditional fields based on content type
    if (contentType === 'document' || contentType === 'story') {
      // For document purchases or full story with documents
      purchaseDataToInsert.highest_page_access = story.asset_type === 'document' ? (story.asset_urls?.length || 0) : 0;
    }

    if (contentType === 'episode' || contentType === 'story') {
      // For episode purchases or full story with episodes
      purchaseDataToInsert.accessible_episode_urls = accessibleUrls;
    }

    const { data: purchaseData, error: purchaseCreateError } = await supabase
      .from('user_content_purchases')
      .insert(purchaseDataToInsert)
      .select()
      .single();

    if (purchaseCreateError) {
      // Rollback coin deduction
      await supabase
        .from('anamcoins')
        .update({
          available_coins: userCoins.available_coins,
          spent_coins: userCoins.spent_coins,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      throw new Error(`Failed to create purchase record: ${purchaseCreateError.message}`);
    }

    // Distribute revenue - pass userId to handle buyer-author same case
    await distributeRevenue(story, totalPrice, purchaseData.id, userId);

    // Update story stats - only for full story purchases
    if (purchaseType === 'full') {
      await supabase
        .from('soul_stories')
        .update({
          total_saved: (story.total_saved || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', storyId);
    }

    return res.status(200).json({
      success: true,
      message: purchaseType === 'individual' ? 'Content purchased successfully' : 'Story purchased successfully',
      purchase: {
        id: purchaseData.id,
        story_id: storyId,
        story_title: story.title,
        content_identifier: contentIdentifierToUse,
        content_type: contentType,
        coins_paid: totalPrice,
        access_granted: {
          full_access: purchaseType === 'full',
          purchased_url: specificUrl || null,
          accessible_urls: accessibleUrls,
          total_accessible: accessibleUrls.length
        },
        purchased_at: purchaseData.created_at
      },
      remaining_coins: userCoins.available_coins - totalPrice
    });

  } catch (error) {
    console.error('Error in purchaseStory controller:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to purchase story'
    });
  }
};

async function distributeRevenue(story: any, totalPrice: number, purchaseId: string, buyerId: string) {
  const authorsToPay: { id: string; share: number; isRemixAuthor?: boolean; isBuyer?: boolean }[] = [];

  const isRemix = story.remix_story_id && story.remix_story;

  if (isRemix) {
    const originalAuthorShare = Math.floor(totalPrice * 0.2);
    let remainingShare = totalPrice - originalAuthorShare;

    if (story.remix_story.author_id !== buyerId) {
      authorsToPay.push({
        id: story.remix_story.author_id,
        share: originalAuthorShare,
        isRemixAuthor: true,
        isBuyer: false
      });
    } else {
      remainingShare += originalAuthorShare;
    }

    const hasCoAuthors = story.co_authors && Array.isArray(story.co_authors) && story.co_authors.length > 0;
    const currentAuthors = hasCoAuthors ? [story.author_id, ...story.co_authors] : [story.author_id];
    const sharePerAuthor = Math.floor(remainingShare / currentAuthors.length);
    const remainder = remainingShare % currentAuthors.length;

    currentAuthors.forEach((authorId: string, index: number) => {
      const isAuthorBuyer = authorId === buyerId;
      authorsToPay.push({
        id: authorId,
        share: sharePerAuthor + (index === 0 ? remainder : 0),
        isRemixAuthor: false,
        isBuyer: isAuthorBuyer
      });
    });
  } else {
    const hasCoAuthors = story.co_authors && Array.isArray(story.co_authors) && story.co_authors.length > 0;
    const allAuthors = hasCoAuthors ? [story.author_id, ...story.co_authors] : [story.author_id];
    const sharePerAuthor = Math.floor(totalPrice / allAuthors.length);
    const remainder = totalPrice % allAuthors.length;

    allAuthors.forEach((authorId: string, index: number) => {
      const isAuthorBuyer = authorId === buyerId;
      authorsToPay.push({
        id: authorId,
        share: sharePerAuthor + (index === 0 ? remainder : 0),
        isRemixAuthor: false,
        isBuyer: isAuthorBuyer
      });
    });
  }

  // Update coins for all authors
  for (const author of authorsToPay) {
    if (author.share > 0) {
      const { data: authorCoins, error: authorError } = await supabase
        .from('anamcoins')
        .select('available_coins, total_coins, user_id')
        .eq('user_id', author.id)
        .single();

      if (!authorError && authorCoins) {
        await supabase
          .from('anamcoins')
          .update({
            available_coins: authorCoins.available_coins + author.share,
            total_coins: authorCoins.total_coins + author.share,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', author.id);
      } else {
        await supabase
          .from('anamcoins')
          .insert({
            user_id: author.id,
            available_coins: author.share,
            total_coins: author.share,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }

      console.log(`Distributed ${author.share} AC to author ${author.id} ${author.isRemixAuthor ? '(remix author)' : ''
        } ${author.isBuyer ? '(buyer)' : ''
        }`);
    }
  }

  const revenueDistribution = authorsToPay.map(author => ({
    author_id: author.id,
    share: author.share,
    is_remix_author: author.isRemixAuthor || false,
    is_buyer: author.isBuyer || false
  }));

  const primaryAuthorShare = authorsToPay.find(a => a.id === story.author_id)?.share || 0;

  await supabase
    .from('user_content_purchases')
    .update({
      author_revenue: primaryAuthorShare,
      revenue_distribution: revenueDistribution,
      updated_at: new Date().toISOString()
    })
    .eq('id', purchaseId);
}

// comments
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
      isUUID ? query : undefined
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
      // Parse the formatted string into JSON
      const parsedData = parseGrammarCorrectionResult(result.data?.correctedText);

      res.status(200).json({
        success: true,
        message: 'Grammar correction completed successfully',
        data: parsedData
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
