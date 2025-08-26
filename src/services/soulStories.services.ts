import { supabase } from '../app';
import { searchAllContent } from '../controllers/soulStories/soulStories.controlller';

// Helper function to get reaction counts from reactions table
const getReactionCounts = async (targetId: string, targetType: 'story' | 'comment') => {
  try {
    const { data: reactions, error } = await supabase
      .from('soul_story_reactions')
      .select('type')
      .eq('target_id', targetId)
      .eq('target_type', targetType);

    if (error) {
      console.log('Error getting reaction counts:', error);
      return {
        total_likes: 0,
        total_dislikes: 0,
        total_insightfuls: 0,
        total_hearts: 0,
        total_hugs: 0,
        total_souls: 0
      };
    }

    const counts = {
      total_likes: 0,
      total_dislikes: 0,
      total_insightfuls: 0,
      total_hearts: 0,
      total_hugs: 0,
      total_souls: 0
    };

    reactions?.forEach(reaction => {
      switch (reaction.type) {
        case 'like': counts.total_likes++; break;
        case 'dislike': counts.total_dislikes++; break;
        case 'insightful': counts.total_insightfuls++; break;
        case 'heart': counts.total_hearts++; break;
        case 'hug': counts.total_hugs++; break;
        case 'soul': counts.total_souls++; break;
      }
    });

    return counts;
  } catch (error) {
    console.error('Error in getReactionCounts:', error);
    return {
      total_likes: 0,
      total_dislikes: 0,
      total_insightfuls: 0,
      total_hearts: 0,
      total_hugs: 0,
      total_souls: 0
    };
  }
};

export const soulStoriesServices = {
  createStory: async (storyData: any,episodes:any[]=[], userId: string) => {
    try {
      console.log('Attempting to insert:', storyData);
      
      const { data, error } = await supabase
        .from('soul_stories')
        .insert([storyData])
        .select()
        .single();
       // If episodes exist, create them
       if (episodes.length > 0) {
        const episodesData = episodes.map((ep, index) => ({
          story_id: data.id, // Use data.id instead of story.id
          episode_number: index + 1,
          title: ep.title || "",
          description: ep.description || "",
          video_url: ep.video_url,
          thumbnail_url: ep.thumbnail_url || ""
        }));
  
        await supabase
          .from('soul_story_episodes')
          .insert(episodesData);
      }
  
      return { 
        success: true,
        message: 'Story created successfully',
        story: data 
      };
  
    } catch (error) {
      console.error('Error creating story:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to create story');
    }
  },

  getAnalytics: async (userId: string) => {
    try {
  
      const { data: analyticsData, error: analyticsError } = await supabase
        .from('soul_stories')
        .select('*').eq('author_id', userId)


      if (analyticsError) {
        console.log('Table not available or error:', analyticsError.message);
        return {
          analytics: {
            total_stories: 0,
            published_stories: 0,
           
            total_revenue: 0,
            category_breakdown: {
              books: 0,
              videos: 0,
              comics: 0,
              manga: 0,
              webtoons: 0
            },
            total_free_pages: 0,
            total_free_episodes: 0
          },
          stories: []
        };
      }

      const stories: any[] = analyticsData || [];

      // If no data, return 0 analytics
      if (!stories || stories.length === 0) {
        return {
          analytics: {
            total_stories: 0,
        
            total_revenue: 0,
            category_breakdown: {
              books: 0,
              videos: 0,
              comics: 0,
              manga: 0,
              webtoons: 0
            },
            total_free_pages: 0,
            total_free_episodes: 0
          },
          stories: []
        };
      }

      const analytics = {
        total_stories: stories.length,
        published_stories: stories.filter(story => story.status === 'published').length,
        total_free_pages: stories.reduce((sum, story) => sum + (story.free_pages || 0), 0),
        total_free_episodes: stories.reduce((sum, story) => sum + (story.free_episodes || 0), 0)
      };

      const storiesTable = stories
        .map(story => ({
          id: story.id,
          title: story.title,
          category: story.category,
          story_type: story.story_type,
          status: story.status,
          created_at: story.created_at,
          price: story.price,
          free_pages: story.free_pages,
          free_episodes: story.free_episodes,
          monetization_type: story.monetization_type,
          is_boosted: story.is_boosted || false,
          boost_type: story.boost_type || null,
          boost_end_date: story.boost_end_date || null
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return {
        analytics,
        stories: storiesTable
      };

    } catch (error) {
      console.error('Error in getAnalytics service:', error);
      // Return 0 analytics on any error
      return {
        analytics: {
          total_stories: 0,
          total_revenue: 0,
          category_breakdown: {
            books: 0,
            videos: 0,
            comics: 0,
            manga: 0,
            webtoons: 0
          },
          total_free_pages: 0,
          total_free_episodes: 0
        },
        stories: []
      };
    }
  },

  getStories: async (userId: string, type: string, options: {
    page: number;
    limit: number;
    sort: string;
  }) => {
    try {
      let query = supabase
      .from('soul_stories')
      .select(`
        *,
        soul_story_episodes(
          id,
          episode_number,
          title,
          description,
          video_url,
          thumbnail_url
        )
      `, { count: 'exact' });
    
    if (type !== 'all') {
      query = query.eq('category', type);
    }

      // Always sort by newest first (descending)
      query = query.order('created_at', { ascending: false });

      // Use the actual limit from options instead of hardcoded 5
      const limit = options.limit; // Remove hardcoded 5
      const offset = (options.page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data: stories, error, count } = await query;

      if (error) {
        console.log('Table not available or error:', error.message);
        return {
          stories: [],
          pagination: {
            page: options.page,
            limit: limit, // Use actual limit
            total: 0,
            totalPages: 0,
            hasMore: false,
            currentPage: options.page,
            nextPage: null,
            prevPage: null
          }
        };
      }

    // Transform stories to include main URL and episode URLs
    const transformedStories = (stories || []).map(story => {
      if (story.content_type === 'episodes' && story.soul_story_episodes) {
        // For episode-based stories, return main URL + episode URLs
        return {
          ...story,
          main_url: story.asset_url, // Main story URL (can be series trailer/cover)
          episode_urls: story.soul_story_episodes.map((ep: any) => ({
            episode_number: ep.episode_number,
            title: ep.title,
            description: ep.description,
            video_url: ep.video_url, // Individual episode video URL
            thumbnail_url: ep.thumbnail_url
          }))
        };
      } else {
        // For single asset stories, return main URL
        return {
          ...story,
          main_url: story.asset_url, // Main story URL
          episode_urls: null // No episodes
        };
      }
    });

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      // Get reaction counts for all stories in ONE query
      const storyIds = transformedStories.map(story => story.id);
      let reactionCounts: Record<string, any> = {};
      let userReactions: Record<string, string> = {};
      let commentCounts: Record<string, number> = {};

      if (storyIds.length > 0) {
        // Get all reaction counts
        const { data: reactions } = await supabase
          .from('soul_story_reactions')
          .select('target_id, type')
          .eq('target_type', 'story')
          .in('target_id', storyIds);
        
        // Get current user's reactions for all stories
        if (userId) {
          const { data: userReactionData } = await supabase
            .from('soul_story_reactions')
            .select('target_id, type')
            .eq('user_id', userId)
            .eq('target_type', 'story')
            .in('target_id', storyIds);
          
          // Create a map of story_id -> user_reaction_type
          userReactionData?.forEach(reaction => {
            userReactions[reaction.target_id] = reaction.type;
          });
        }
        
        // Get comment counts for all stories
        const { data: comments } = await supabase
          .from('soul_story_comments')
          .select('soul_story_id')
          .in('soul_story_id', storyIds)
          .eq('is_deleted', false);
        
        // Calculate comment counts for each story
        storyIds.forEach(storyId => {
          commentCounts[storyId] = comments?.filter(c => c.soul_story_id === storyId).length || 0;
        });
        
        // Calculate reaction counts for each story
        storyIds.forEach(storyId => {
          const storyReactions = reactions?.filter(r => r.target_id === storyId) || [];
          reactionCounts[storyId] = {
            total_likes: storyReactions.filter(r => r.type === 'like').length,
            total_dislikes: storyReactions.filter(r => r.type === 'dislike').length,
            total_hearts: storyReactions.filter(r => r.type === 'heart').length,
            total_souls: storyReactions.filter(r => r.type === 'soul').length,
            total_insightfuls: storyReactions.filter(r => r.type === 'insightful').length,
            total_hugs: storyReactions.filter(r => r.type === 'hug').length
          };
        });
      }

      // Add reaction counts, user reaction, and comment count to each story
      const storiesWithReactions = transformedStories.map(story => ({
        ...story,
        total_likes: reactionCounts[story.id]?.total_likes || 0,
        total_dislikes: reactionCounts[story.id]?.total_dislikes || 0,
        total_hearts: reactionCounts[story.id]?.total_hearts || 0,
        total_souls: reactionCounts[story.id]?.total_souls || 0,
        total_insightfuls: reactionCounts[story.id]?.total_insightfuls || 0,
        total_hugs: reactionCounts[story.id]?.total_hugs || 0,
        user_reaction: userReactions[story.id] || null,
        total_comments: commentCounts[story.id] || 0,
        total_views: story.total_views || 0  // ← This is already available from the story data
      }));

      // Sort stories: boosted first, then by engagement (no limit on boosted stories)
      const sortedStories = storiesWithReactions.sort((a, b) => {
        // Boosted stories first (no limit - all boosted stories can appear)
        if (a.is_boosted && !b.is_boosted) return -1;
        if (!a.is_boosted && b.is_boosted) return 1;
        
        // If both boosted or both not boosted, sort by engagement
        const aEngagement = (a.total_likes + a.total_hearts + a.total_insightfuls + a.total_hugs + a.total_souls) + a.total_comments;
        const bEngagement = (b.total_likes + b.total_hearts + b.total_insightfuls + b.total_hugs + b.total_souls) + b.total_comments;
        
        return bEngagement - aEngagement;
      });

      // Limit boosted stories to top 3-4 positions
      const boostedStories = sortedStories.filter(story => story.is_boosted).slice(0, 4);
      const regularStories = sortedStories.filter(story => !story.is_boosted);

      const finalStories = [...boostedStories, ...regularStories];

      return {
        stories: finalStories,
        pagination: {
          page: options.page,
          limit: limit, // Use actual limit
          total,
          totalPages,
          hasMore: (options.page * limit) < total,
          currentPage: options.page,
          nextPage: options.page < totalPages ? options.page + 1 : null,
          prevPage: options.page > 1 ? options.page - 1 : null
        }
      };

    } catch (error) {
      console.error('Error in getStories service:', error);
      // Return empty data on any error
      return {
        stories: [],
        pagination: {
          page: options.page,
          limit: options.limit,
          total: 0,
          totalPages: 0,
          hasMore: false,
          currentPage: options.page,
          nextPage: null,
          prevPage: null
        }
      };
    }
  },
  async deleteStory(userId:string,story_id:string){
    try {
      // Check if story exists and user owns it
      const { data: story, error: checkError } = await supabase
        .from('soul_stories')
        .select('id, author_id')
        .eq('id', story_id)
        .single();

      if (checkError || !story) {
        throw new Error('Story not found');
      }

      if (story.author_id !== userId) {
        throw new Error('Unauthorized to delete this story');
      }

      // Delete episodes first (due to foreign key constraint)
      const { error: episodesError } = await supabase
        .from('soul_story_episodes')
        .delete()
        .eq('story_id', story_id);

      if (episodesError) {
        console.error('Error deleting episodes:', episodesError);
        throw new Error('Failed to delete episodes');
      }

      // Delete the main story
      const { error: storyError } = await supabase
        .from('soul_stories')
        .delete()
        .eq('id', story_id);

      if (storyError) {
        console.error('Error deleting story:', storyError);
        throw new Error('Failed to delete story');
      }

      return {
        success: true,
        message: 'Story and episodes deleted successfully'
      };

    } catch (error) {
      console.error('Error in deleteStory service:', error);
      throw error; // Re-throw to be handled by controller
    }
  },
  purchaseContent: async (userId: string, storyId: string, contentData: Array<{type: 'page' | 'episode', identifier: string | number, coins: number}>) => {
    try {
      // Check user level from profiles table
      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('user_level')
        .eq('id', userId)
        .single();

      if (profileError || !userProfile) {
        throw new Error('User profile not found');
      }

      if (!userProfile.user_level || userProfile.user_level < 1) {
        return 'Not allowed';
      }

      // Get existing access for this user and story
      const { data: existingAccess, error: accessError } = await supabase
        .from('user_content_purchases')
        .select('*')
        .eq('user_id', userId)
        .eq('story_id', storyId)
        .single();

      let currentHighestPage = existingAccess?.highest_page_access || 0;
      let currentEpisodes = existingAccess?.accessible_episode_urls || [];
      let totalSpent = existingAccess?.total_coins_spent || 0;
      let totalRevenue = existingAccess?.author_revenue || 0;

      // Process each content item
      contentData.forEach(item => {
        if (item.type === 'page') {
          // For pages, increment the highest page access by 1 for each page purchased
          currentHighestPage += 1;
        } else if (item.type === 'episode') {
          if (!currentEpisodes.includes(item.identifier)) {
            currentEpisodes.push(item.identifier);
          }
        }
        totalSpent += item.coins;
        totalRevenue += item.coins;
      });

      // Determine content_type
      let contentType = 'page';
      if (contentData.some(item => item.type === 'episode')) {
        contentType = 'episode';
      }

      // Update or insert the access record
      const { data: upsertData, error: accessUpdateError } = await supabase
        .from('user_content_purchases')
        .upsert({
          user_id: userId,
          story_id: storyId,
          content_type: contentType,
          content_identifier: 'access',
          coins_paid: contentData.reduce((sum, item) => sum + item.coins, 0),
          author_revenue: totalRevenue,
          highest_page_access: currentHighestPage,
          accessible_episode_urls: currentEpisodes,
          total_coins_spent: totalSpent,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,story_id'
        });

      if (accessUpdateError) {
        console.log('❌ Upsert error details:', {
          error: accessUpdateError,
          data: {
            user_id: userId,
            story_id: storyId,
            content_type: contentType,
            content_identifier: 'access',
            coins_paid: contentData.reduce((sum, item) => sum + item.coins, 0),
            author_revenue: totalRevenue,
            highest_page_access: currentHighestPage,
            accessible_episode_urls: currentEpisodes,
            total_coins_spent: totalSpent
          }
        });
        throw new Error(`Failed to update story access: ${accessUpdateError.message}`);
      }

      // Handle coin transfers
      const totalCoins = contentData.reduce((sum, item) => sum + item.coins, 0);

      // Get user's current coins
      const { data: userCoins, error: userError } = await supabase
        .from('anamcoins')
        .select('available_coins, spent_coins, total_coins')
        .eq('user_id', userId)
        .single();

      if (userError || !userCoins) {
        throw new Error('User coins account not found');
      }

      if (userCoins.available_coins < totalCoins) {
        throw new Error(`Insufficient coins. Need ${totalCoins}, have ${userCoins.available_coins}`);
      }

      // Update user coins (deduct)
      const { error: userUpdateError } = await supabase
        .from('anamcoins')
        .update({
          available_coins: userCoins.available_coins - totalCoins,
          spent_coins: (userCoins.spent_coins || 0) + totalCoins,
          total_coins: userCoins.total_coins  // Keep total_coins unchanged (available + spent)
        })
        .eq('user_id', userId);

      if (userUpdateError) {
        throw new Error('Failed to update user coins');
      }

      // Get story author's current coins
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select('author_id')
        .eq('id', storyId)
        .single();

      if (storyError || !story) {
        throw new Error('Story not found');
      }

      const { data: authorCoins, error: authorError } = await supabase
        .from('anamcoins')
        .select('available_coins, total_coins')
        .eq('user_id', story.author_id)
        .single();

      if (authorError || !authorCoins) {
        throw new Error('Author coins account not found');
      }

      // Update author coins (add)
      const { error: authorUpdateError } = await supabase
        .from('anamcoins')
        .update({
          available_coins: authorCoins.available_coins + totalCoins,
          total_coins: authorCoins.total_coins + totalCoins  // Increase total_coins
        })
        .eq('user_id', story.author_id);

      if (authorUpdateError) {
        throw new Error('Failed to update author coins');
      }

      return {
        success: true,
        highest_page_access: currentHighestPage,
        accessible_episodes: currentEpisodes,
        total_coins_spent: totalSpent,
        author_revenue: totalRevenue,
        message: 'Content purchased successfully'
      };

    } catch (error) {
      console.error('Error purchasing content:', error);
      throw error;
    }
  }, 
  
  getStoryAccess: async (userId: string, storyId: string) => {
    try {
      // Get story details
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select('*')
        .eq('id', storyId)
        .single();
  
      if (storyError || !story) {
        return { success: false, message: 'Story not found' };
      }

      // Increment view count for the story
      await supabase
        .from('soul_stories')
        .update({ total_views: (story.total_views || 0) + 1 })
        .eq('id', storyId);
  
      // Get user's access for this story from existing table
      const { data: userAccess } = await supabase
        .from('user_content_purchases')  // Use existing table
        .select('*')
        .eq('user_id', userId)
        .eq('story_id', storyId)
        .single();
  
      if (story.asset_type === 'document') {
        // PDF Story - Return total accessible pages
        const totalAccessiblePages = story.free_pages + (userAccess?.highest_page_access || 0);
        
        return {
          story_id: storyId,
          story_title: story.title,
          story_category: story.category,
          story_type: 'PDF',
          free_pages: story.free_pages,
          purchased_pages: userAccess?.highest_page_access || 0,
          total_accessible_pages: totalAccessiblePages,
          total_coins_spent: userAccess?.total_coins_spent || 0,
          author_revenue: userAccess?.author_revenue || 0
        };
  
      } else if (story.asset_type === 'video') {
        // Video Story - Return accessible episode URLs
        const accessibleEpisodes = userAccess?.accessible_episode_urls || [];
        const totalAccessibleEpisodes = story.free_episodes + accessibleEpisodes.length;
        
        return {
          story_id: storyId,
          story_title: story.title,
          story_category: story.category,
          story_type: 'Video',
          free_episodes: story.free_episodes,
          accessible_episode_urls: accessibleEpisodes,
          total_accessible_episodes: totalAccessibleEpisodes,
          total_coins_spent: userAccess?.total_coins_spent || 0,
          author_revenue: userAccess?.author_revenue || 0
        };
      }
  
      throw new Error('Invalid story type');
  
    } catch (error) {
      console.error('Error getting story access:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getUserRevenue: async (userId: string) => {
    try {
      // Get all stories created by the user
      const { data: userStories, error: storiesError } = await supabase
        .from('soul_stories')
        .select('id, title, category, story_type, asset_type')
        .eq('author_id', userId);

      if (storiesError) {
        throw new Error('Failed to fetch user stories');
      }

      if (!userStories || userStories.length === 0) {
        return {
          user_id: userId,
          total_revenue: 0,
          total_stories: 0,
          story_revenue: []
        };
      }

      // Get all purchases for user's stories from the correct table name
      const storyIds = userStories.map(story => story.id);
      const { data: purchases, error: purchasesError } = await supabase
        .from('user_content_purchases')  // Fixed: correct table name with underscore
        .select('story_id, author_revenue, total_coins_spent, highest_page_access, accessible_episode_urls')
        .in('story_id', storyIds);

      if (purchasesError) {
        throw new Error('Failed to fetch story purchases');
      }

      // Group revenue by story
      const storyRevenue = userStories.map(story => {
        const storyPurchases = purchases?.filter(p => p.story_id === story.id) || [];
        
        // Calculate total revenue for this story
        const totalRevenue = storyPurchases.reduce((sum, p) => sum + (p.author_revenue || 0), 0);
        
        // Count pages sold (highest page access)
        const pagesSold = storyPurchases.reduce((max, p) => Math.max(max, p.highest_page_access || 0), 0);
        
        // Count episodes sold (number of accessible episode URLs)
        const episodesSold = storyPurchases.reduce((sum, p) => sum + (p.accessible_episode_urls?.length || 0), 0);

        return {
          story_id: story.id,
          story_title: story.title,
          story_category: story.category,
          story_type: story.story_type,
          asset_type: story.asset_type,
          total_revenue: totalRevenue,
          pages_sold: pagesSold,
          episodes_sold: episodesSold,
          total_coins_earned: totalRevenue
        };
      });

      const totalRevenue = storyRevenue.reduce((sum, story) => sum + story.total_revenue, 0);

      return {
        user_id: userId,
        total_revenue:totalRevenue,
        total_stories: userStories.length,
        story_revenue: storyRevenue
      };

    } catch (error) {
      console.error('Error fetching user revenue:', error);
      throw error;
    }
  }, 
  searchAllContent: async (query: string, category: string, userId: string) => {
    try {
      console.log('Search params:', { query, category, userId });
      
      let supabaseQuery = supabase
        .from('soul_stories')
        .select(`
          *,
          soul_story_episodes(
            id,
            episode_number,
            title,
            description,
            video_url,
            thumbnail_url
          )
        `, { count: 'exact' });

      // Apply category filter if specified
      if (category && category !== 'all') {
        supabaseQuery = supabaseQuery.eq('category', category);
        console.log('Filtering by category:', category);
      }

      // Add comprehensive text search if query is not 'all'
      if (query && query.toLowerCase() !== 'all') {
        console.log('Adding comprehensive text search for:', query);
        
        // Search across multiple fields - if ANY field contains the query, return the story
        supabaseQuery = supabaseQuery.or(
          `title.ilike.%${query}%,description.ilike.%${query}%,tags.cs.{${query}}`
        );
      }

      supabaseQuery = supabaseQuery.order('created_at', { ascending: false });

      console.log('Final query built');

      const { data: stories, error, count } = await supabaseQuery;

      if (error) {
        console.log('Search error:', error.message);
        return {
          success: false,
          data: {
            analytics: {
              total_stories: 0,
              published_stories: 0,
              total_free_pages: 0,
              total_free_episodes: 0
            },
            stories: []
          }
        };
      }

      console.log('Raw stories found:', stories?.length || 0);
      if (stories && stories.length > 0) {
        console.log('Sample stories:', stories.slice(0, 3).map(s => ({ 
          id: s.id, 
          title: s.title, 
          description: s.description,
          tags: s.tags,
          category: s.category
        })));
      }

      // Transform stories to include main URL and episode URLs EXACTLY like getStories
      const transformedStories = (stories || []).map(story => {
        if (story.content_type === 'episodes' && story.soul_story_episodes) {
          // For episode-based stories, return main URL + episode URLs
          return {
            ...story,
            main_url: story.asset_url, // Main story URL (can be series trailer/cover)
            episode_urls: story.soul_story_episodes.map((ep: any) => ({
              episode_number: ep.episode_number,
              title: ep.title,
              description: ep.description,
              video_url: ep.video_url, // Individual episode video URL
              thumbnail_url: ep.thumbnail_url
            }))
          };
        } else {
          // For single asset stories, return main URL
          return {
            ...story,
            main_url: story.asset_url, // Main story URL
            episode_urls: null // No episodes
          };
        }
      });

      // Calculate analytics
      const analytics = {
        total_stories: transformedStories.length,
        published_stories: transformedStories.filter(story => story.status === 'published').length,
        total_free_pages: transformedStories.reduce((sum, story) => sum + (story.free_pages || 0), 0),
        total_free_episodes: transformedStories.reduce((sum, story) => sum + (story.free_episodes || 0), 0)
      };

      // Get top 20 results
      const top20Results = transformedStories.slice(0, 20);

      console.log('Final results:', {
        totalFound: transformedStories.length,
        returned: top20Results.length,
        analytics
      });

      return {
        success: true,
        data: {
          analytics,
          stories: top20Results
        }
      };

    } catch (error) {
      console.error('Error in searchAllContent:', error);
      return {
        success: false,
        data: {
          analytics: {
            total_stories: 0,
            published_stories: 0,
            total_free_pages: 0,
            total_free_episodes: 0
          },
          stories: []
        }
      };
    }
  },
  createComment: async (userId: string, soulStoryId: string, content: string, imgs: string[] = []) => {
    try {
      console.log('Searching for soul story with ID:', soulStoryId);
      
      // First, let's check if the story exists at all
      const { data: storyData, error: storyError } = await supabase
        .from('soul_stories')
        .select('id, author_id, title')
        .eq('id', soulStoryId)
        .single();

      if (storyError) {
        console.log('Story error details:', storyError);
        if (storyError.code === 'PGRST116') {
          return { success: false, message: 'Soul story not found!' };
        }
        return { success: false, message: `Database error: ${storyError.message}` };
      }

      if (!storyData) {
        return { success: false, message: 'Soul story not found!' };
      }

      // Check if story is deleted (only if the field exists)
      try {
        const { data: deletedCheck } = await supabase
          .from('soul_stories')
          .select('is_deleted')
          .eq('id', soulStoryId)
          .single();
        
        if (deletedCheck?.is_deleted === true) {
          return { success: false, message: 'Soul story has been deleted!' };
        }
      } catch (fieldError) {
        // Field doesn't exist, continue without deletion check
        console.log('is_deleted field not found, skipping deletion check');
      }

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .single();

      if (!userProfile) {
        return { success: false, message: 'User profile not found!' };
      }

      const user_name = `${userProfile.first_name}${userProfile.last_name ? ` ${userProfile.last_name}` : ''}`;

      const { data, error } = await supabase
        .from('soul_story_comments')
        .insert([{
          soul_story_id: soulStoryId,
          content,
          imgs,
          user_name,
          user_id: userId
        }])
        .select();

      if (error) {
        console.log('Comment insert error:', error);
        return { success: false, message: error.message };
      }

      if (!data || data.length === 0) {
        return { success: false, message: 'Comment creation failed' };
      }

      return {
        success: true,
        message: 'Comment created successfully!',
        data: data[0]
      };

    } catch (error) {
      console.error('Error in createComment service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  createReply: async (userId: string, commentId: string, content: string, imgs: string[] = []) => {
    try {
      // Verify parent comment exists
      const { data: commentData, error: commentError } = await supabase
        .from('soul_story_comments')
        .select('id, soul_story_id')
        .eq('id', commentId)
        .eq('is_deleted', false)
        .single();

      if (commentError || !commentData) {
        return { success: false, message: 'Parent comment not found!' };
      }

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .single();

      if (!userProfile) {
        return { success: false, message: 'User profile not found!' };
      }

      const user_name = `${userProfile.first_name}${userProfile.last_name ? ` ${userProfile.last_name}` : ''}`;

      const { data, error } = await supabase
        .from('soul_story_comments')
        .insert([{
          soul_story_id: commentData.soul_story_id,
          content,
          imgs,
          user_name,
          user_id: userId,
          reply_to_id: commentId,
          is_reply: true
        }])
        .select();

      if (error) {
        return { success: false, message: error.message };
      }

      if (!data || data.length === 0) {
        return { success: false, message: 'Reply creation failed' };
      }

      return {
        success: true,
        message: 'Reply created successfully!',
        data: data[0]
      };

    } catch (error) {
      console.error('Error in createReply service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getComments: async (soulStoryId: string, page: number = 1, limit: number = 10, userId?: string) => {
    try {
      const offset = (page - 1) * limit;

      const { data: comments, error, count } = await supabase
        .from('soul_story_comments')
        .select('*', { count: 'exact' })
        .eq('soul_story_id', soulStoryId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return { success: false, message: error.message };
      }

      if (userId && comments) {
        const commentsWithReactions = await Promise.all(comments.map(async (comment) => {
          const { data: reactionData } = await supabase
            .from('soul_story_reactions')
            .select('type')
            .eq('user_id', userId)
            .eq('target_id', comment.id)
            .eq('target_type', 'comment')
            .maybeSingle();

          return {
            ...comment,
            user_reaction: reactionData?.type || null
          };
        }));

        return {
          success: true,
          data: {
            comments: commentsWithReactions,
            total: count,
            page,
            limit
          }
        };
      }

      return {
        success: true,
        data: {
          comments: comments || [],
          total: count,
          page,
          limit
        }
      };

    } catch (error) {
      console.error('Error in getComments service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getCommentsWithReplies: async (soulStoryId: string, page: number = 1, limit: number = 10, userId?: string) => {
    try {
      const offset = (page - 1) * limit;

      // Get main comments (not replies)
      const { data: comments, error, count } = await supabase
        .from('soul_story_comments')
        .select('*', { count: 'exact' })
        .eq('soul_story_id', soulStoryId)
        .eq('is_deleted', false)
        .eq('is_reply', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return { success: false, message: error.message };
      }

      if (userId && comments) {
        const commentsWithReplies = await Promise.all(comments.map(async (comment) => {
          // Get replies for this comment
          const { data: replies } = await supabase
            .from('soul_story_comments')
            .select('*')
            .eq('reply_to_id', comment.id)
            .eq('is_deleted', false)
            .eq('is_reply', true)
            .order('created_at', { ascending: true });

          // Get user reaction for comment
          const { data: commentReaction } = await supabase
            .from('soul_story_reactions')
            .select('type')
            .eq('user_id', userId)
            .eq('target_id', comment.id)
            .eq('target_type', 'comment')
            .maybeSingle();

          // Get user reactions for replies
          const repliesWithReactions = await Promise.all((replies || []).map(async (reply) => {
            const { data: replyReaction } = await supabase
              .from('soul_story_reactions')
              .select('type')
              .eq('user_id', userId)
              .eq('target_id', reply.id)
              .eq('target_type', 'comment')
              .maybeSingle();

            return {
              ...reply,
              user_reaction: replyReaction?.type || null
            };
          }));

          return {
            ...comment,
            user_reaction: commentReaction?.type || null,
            replies: repliesWithReactions
          };
        }));

        return {
          success: true,
          data: {
            comments: commentsWithReplies,
            total: count,
            page,
            limit
          }
        };
      }

      return {
        success: true,
        data: {
          comments: comments || [],
          total: count,
          page,
          limit
        }
      };

    } catch (error) {
      console.error('Error in getCommentsWithReplies service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  updateComment: async (userId: string, commentId: string, content: string, imgs: string[] = []) => {
    try {
      const { data: commentData, error: fetchError } = await supabase
        .from('soul_story_comments')
        .select('user_id')
        .eq('id', commentId)
        .eq('is_deleted', false)
        .single();

      if (fetchError || !commentData) {
        return { success: false, message: 'Comment not found!' };
      }

      if (commentData.user_id !== userId) {
        return { success: false, message: 'You can only edit your own comments!' };
      }

      const { error: updateError } = await supabase
        .from('soul_story_comments')
        .update({
          content,
          imgs: imgs || [],
          updated_at: new Date().toISOString()
        })
        .eq('id', commentId);

      if (updateError) {
        return { success: false, message: updateError.message };
      }

      return { success: true, message: 'Comment updated successfully!' };

    } catch (error) {
      console.error('Error in updateComment service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  deleteComment: async (userId: string, commentId: string) => {
    try {
      const { data: commentData, error: fetchError } = await supabase
        .from('soul_story_comments')
        .select('user_id')
        .eq('id', commentId)
        .eq('is_deleted', false)
        .single();

      if (fetchError || !commentData) {
        return { success: false, message: 'Comment not found!' };
      }

      if (commentData.user_id !== userId) {
        return { success: false, message: 'You can only delete your own comments!' };
      }

      const { error: deleteError } = await supabase
        .from('soul_story_comments')
        .update({ is_deleted: true })
        .eq('id', commentId);

      if (deleteError) {
        return { success: false, message: deleteError.message };
      }

      return { success: true, message: 'Comment deleted successfully!' };

    } catch (error) {
      console.error('Error in deleteComment service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  updateCommentReaction: async (userId: string, commentId: string, type: string) => {
    try {
      console.log('updateCommentReaction service called with:', { userId, commentId, type });
      
      const { data: existing, error: fetchError } = await supabase
        .from('soul_story_reactions')
        .select('*')
        .eq('user_id', userId)
        .eq('target_id', commentId)
        .eq('target_type', 'comment')
        .single();

      console.log('Existing reaction check:', { existing, fetchError });

      const { data: commentData, error: commentError } = await supabase
        .from('soul_story_comments')
        .select('user_id, content, total_likes, total_dislikes, total_insightfuls, total_hearts, total_hugs, total_souls')
        .eq('id', commentId)
        .eq('is_deleted', false)
        .single();

      console.log('Comment data check:', { commentData, commentError });

      if (commentError || !commentData) {
        console.log('Comment not found or error:', commentError);
        return { success: false, message: 'Comment not found!' };
      }

      const fieldMap: Record<string, string> = {
        'like': 'total_likes',
        'dislike': 'total_dislikes',
        'insightful': 'total_insightfuls',
        'heart': 'total_hearts',
        'hug': 'total_hugs',
        'soul': 'total_souls'
      };

      const currentField = fieldMap[type];
      const updates: Record<string, number> = {};

      if (existing) {
        if (existing.type === type) {
          updates[currentField] = Math.max(0, (commentData as any)[currentField] - 1);

          const { error: deleteError } = await supabase
            .from('soul_story_reactions')
            .delete()
            .eq('id', existing.id);

          if (deleteError) {
            console.log('Delete reaction error:', deleteError);
            return { success: false, message: deleteError.message };
          }

          const { error: updateCommentError } = await supabase
            .from('soul_story_comments')
            .update(updates)
            .eq('id', commentId);

          if (updateCommentError) {
            console.log('Update comment error:', updateCommentError);
            return { success: false, message: updateCommentError.message };
          }

          return { success: true, message: `${type} removed!` };
        }

        const prevField = fieldMap[existing.type];
        updates[prevField] = Math.max(0, (commentData as any)[prevField] - 1);
        updates[currentField] = (commentData as any)[currentField] + 1;

        const { error: updateReactionError } = await supabase
          .from('soul_story_reactions')
          .update({ type, updated_by: userId })
          .eq('id', existing.id);

        if (updateReactionError) {
          console.log('Update reaction error:', updateReactionError);
          return { success: false, message: updateReactionError.message };
        }

        const { error: updateCommentError } = await supabase
          .from('soul_story_comments')
          .update(updates)
          .eq('id', commentId);

        if (updateCommentError) {
          console.log('Update comment error:', updateCommentError);
          return { success: false, message: updateCommentError.message };
        }

        return { success: true, message: `Reaction updated to ${type}!` };
      }

      updates[currentField] = (commentData as any)[currentField] + 1;

      const { error: insertError } = await supabase
        .from('soul_story_reactions')
        .insert([{ user_id: userId, target_id: commentId, target_type: 'comment', type }]);

      if (insertError) {
        console.log('Insert reaction error:', insertError);
        return { success: false, message: insertError.message };
      }

      const { error: updateCommentError } = await supabase
        .from('soul_story_comments')
        .update(updates)
        .eq('id', commentId);

      if (updateCommentError) {
        console.log('Update comment error:', updateCommentError);
        return { success: false, message: updateCommentError.message };
      }

      return { success: true, message: `${type} added!` };

    } catch (error) {
      console.error('Error in updateCommentReaction service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  updateStoryReaction: async (userId: string, storyId: string, type: string) => {
    try {
      console.log('updateStoryReaction service called with:', { userId, storyId, type });
      
      const { data: existing, error: fetchError } = await supabase
        .from('soul_story_reactions')
        .select('*')
        .eq('user_id', userId)
        .eq('target_id', storyId)
        .eq('target_type', 'story')
        .single();

      console.log('Existing reaction check:', { existing, fetchError });

      // Just check if story exists (without is_deleted filter)
      const { data: storyData, error: storyError } = await supabase
        .from('soul_stories')
        .select('id, author_id, title')
        .eq('id', storyId)
        .single();

      console.log('Story data check:', { storyData, storyError });

      if (storyError || !storyData) {
        console.log('Story not found or error:', storyError);
        return { success: false, message: 'Story not found!' };
      }

      if (existing) {
        if (existing.type === type) {
          // Remove reaction - just delete from reactions table
          const { error: deleteError } = await supabase
            .from('soul_story_reactions')
            .delete()
            .eq('id', existing.id);

          if (deleteError) {
            console.log('Delete reaction error:', deleteError);
            return { success: false, message: deleteError.message };
          }

          // Get updated counts from reactions table
          const reactionCounts = await getReactionCounts(storyId, 'story');

          return { 
            success: true, 
            message: `${type} removed!`,
            data: {
              reaction_counts: reactionCounts,
              user_reaction: null,
              total_reactions: Object.values(reactionCounts).reduce((sum, count) => sum + count, 0)
            }
          };
        }

        // Change reaction type - just update the reaction
        const { error: updateReactionError } = await supabase
          .from('soul_story_reactions')
          .update({ type, updated_by: userId })
          .eq('id', existing.id);

        if (updateReactionError) {
          console.log('Update reaction error:', updateReactionError);
          return { success: false, message: updateReactionError.message };
        }

        // Get updated counts from reactions table
        const reactionCounts = await getReactionCounts(storyId, 'story');

        return { 
          success: true, 
          message: `Reaction updated to ${type}!`,
          data: {
            reaction_counts: reactionCounts,
            user_reaction: type,
            total_reactions: Object.values(reactionCounts).reduce((sum, count) => sum + count, 0)
          }
        };
      }

      // Add new reaction - just insert into reactions table
      const { error: insertError } = await supabase
        .from('soul_story_reactions')
        .insert([{ user_id: userId, target_id: storyId, target_type: 'story', type }]);

      if (insertError) {
        console.log('Insert reaction error:', insertError);
        return { success: false, message: insertError.message };
      }

      // Get updated counts from reactions table
      const reactionCounts = await getReactionCounts(storyId, 'story');

      return { 
        success: true, 
        message: `${type} added!`,
        data: {
          reaction_counts: reactionCounts,
          user_reaction: type,
          total_reactions: Object.values(reactionCounts).reduce((sum, count) => sum + count, 0)
        }
      };

    } catch (error) {
      console.error('Error in updateStoryReaction service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getStoryWithReactions: async (storyId: string, userId?: string) => {
    try {
      console.log('getStoryWithReactions called with:', { storyId, userId });
      
      // Get the story data
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select('*')
        .eq('id', storyId)
        .single();

      console.log('Story data:', story);
      console.log('Story error:', storyError);

      if (storyError || !story) {
        return { success: false, message: 'Story not found!' };
      }

      let userReaction = null;

      if (userId) {
        const { data: reactionData } = await supabase
          .from('soul_story_reactions')
          .select('type')
          .eq('user_id', userId)
          .eq('target_id', storyId)
          .eq('target_type', 'story')
          .maybeSingle();

        userReaction = reactionData?.type || null;
      }

      // Get reaction counts from reactions table instead of story table
      const reaction_counts = await getReactionCounts(storyId, 'story');

      console.log('Returning story with reactions:', {
        storyId,
        reaction_counts,
        userReaction
      });

      return {
        success: true,
        data: {
          ...story,
          reaction_counts,
          user_reaction: userReaction,
          // Add total_reactions field
          total_reactions: Object.values(reaction_counts).reduce((sum, count) => sum + count, 0)
        }
      };

    } catch (error) {
      console.error('Error in getStoryWithReactions service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getCommentReactions: async (commentId: string, userId?: string) => {
    try {
      // Get all reactions for this comment
      const { data: reactions, error: reactionsError } = await supabase
        .from('soul_story_reactions')
        .select('*')
        .eq('target_id', commentId)
        .eq('target_type', 'comment');

      if (reactionsError) {
        console.log('Error getting comment reactions:', reactionsError);
        return { success: false, message: reactionsError.message };
      }

      // Get current user's reaction if logged in
      let userReaction = null;
      if (userId) {
        const userReactionData = reactions?.find(r => r.user_id === userId);
        userReaction = userReactionData?.type || null;
      }

      // Calculate reaction counts
      const reaction_counts = {
        total_likes: reactions?.filter(r => r.type === 'like').length || 0,
        total_dislikes: reactions?.filter(r => r.type === 'dislike').length || 0,
        total_insightfuls: reactions?.filter(r => r.type === 'insightful').length || 0,
        total_hearts: reactions?.filter(r => r.type === 'heart').length || 0,
        total_hugs: reactions?.filter(r => r.type === 'hug').length || 0,
        total_souls: reactions?.filter(r => r.type === 'soul').length || 0,
      };

      // Get users who reacted (with profile data)
      const userIds = reactions?.map(r => r.user_id) || [];
      let usersWithReactions: any[] = [];

      if (userIds.length > 0) {
        const { data: userProfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds);

        // Map reactions to user profiles
        usersWithReactions = reactions?.map(reaction => {
          const userProfile = userProfiles?.find(p => p.id === reaction.user_id);
          return {
            reaction_id: reaction.id,
            reaction_type: reaction.type,
            reacted_at: reaction.created_at,
            user: userProfile ? {
              id: userProfile.id,
              name: `${userProfile.first_name} ${userProfile.last_name || ''}`.trim(),
              avatar: userProfile.avatar_url
            } : null
          };
        }) || [];
      }

      return {
        success: true,
        data: {
          comment_id: commentId,
          reaction_counts,
          user_reaction: userReaction,
          total_reactions: Object.values(reaction_counts).reduce((sum, count) => sum + count, 0),
          users_who_reacted: usersWithReactions
        }
      };

    } catch (error) {
      console.error('Error in getCommentReactions service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getTrendingStories: async (userId?: string, page: number = 1, limit: number = 200) => {
    try {
      const offset = (page - 1) * limit;

      // Get all stories first
      const { data: stories, error, count } = await supabase
        .from('soul_stories')
        .select(`
          *,
          soul_story_episodes(
            id, episode_number, title, description, video_url, thumbnail_url
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.log('Error getting trending stories:', error);
        return { success: false, message: error.message };
      }

      // Transform stories to match getStories structure
      const transformedStories = stories?.map(story => ({
        ...story,
        episodes: story.soul_story_episodes || [],
        total_episodes: story.soul_story_episodes?.length || 0
      })) || [];

      // Get reaction counts for all stories in ONE query
      const storyIds = transformedStories.map(story => story.id);
      let reactionCounts: Record<string, any> = {};
      let userReactions: Record<string, string> = {};
      let commentCounts: Record<string, number> = {};

      if (storyIds.length > 0) {
        // Get all reaction counts
        const { data: reactions } = await supabase
          .from('soul_story_reactions')
          .select('target_id, type')
          .eq('target_type', 'story')
          .in('target_id', storyIds);
        
        // Get current user's reactions for all stories
        if (userId) {
          const { data: userReactionData } = await supabase
            .from('soul_story_reactions')
            .select('target_id, type')
            .eq('target_type', 'story')
            .eq('user_id', userId)
            .in('target_id', storyIds);

          userReactionData?.forEach(reaction => {
            userReactions[reaction.target_id] = reaction.type;
          });
        }

        // Get comment counts for all stories
        const { data: commentData } = await supabase
          .from('soul_story_comments')
          .select('soul_story_id')
          .eq('is_deleted', false)
          .in('soul_story_id', storyIds);

        // Calculate reaction counts and comment counts
        storyIds.forEach(storyId => {
          const storyReactions = reactions?.filter(r => r.target_id === storyId) || [];
          const storyComments = commentData?.filter(c => c.soul_story_id === storyId) || [];
          
          reactionCounts[storyId] = {
            total_likes: storyReactions.filter(r => r.type === 'like').length,
            total_dislikes: storyReactions.filter(r => r.type === 'dislike').length,
            total_insightfuls: storyReactions.filter(r => r.type === 'insightful').length,
            total_hearts: storyReactions.filter(r => r.type === 'heart').length,
            total_hugs: storyReactions.filter(r => r.type === 'hug').length,
            total_souls: storyReactions.filter(r => r.type === 'soul').length
          };
          
          commentCounts[storyId] = storyComments.length;
        });
      }

      // Add reaction counts and comment counts to stories
      const storiesWithEngagement = transformedStories.map(story => {
        const reactions = reactionCounts[story.id] || {};
        const commentCount = commentCounts[story.id] || 0;
        
        // Calculate total engagement score
        const totalReactions = (reactions.total_likes || 0) + 
                             (reactions.total_hearts || 0) + 
                             (reactions.total_insightfuls || 0) + 
                             (reactions.total_hugs || 0) + 
                             (reactions.total_souls || 0);
        
        // Include views in engagement score
        const totalEngagement = totalReactions + commentCount + (story.total_views || 0);
        
        return {
          ...story,
          total_likes: reactions.total_likes || 0,
          total_dislikes: reactions.total_dislikes || 0,
          total_insightfuls: reactions.total_insightfuls || 0,
          total_hearts: reactions.total_hearts || 0,
          total_hugs: reactions.total_hugs || 0,
          total_souls: reactions.total_souls || 0,
          user_reaction: userReactions[story.id] || null,
          total_comments: commentCount,
          total_views: story.total_views || 0,
          total_engagement: totalEngagement,
          total_reactions: totalReactions
        };
      });

      // Sort by total engagement (reactions + comments) - HIGHEST FIRST
      const sortedStories = storiesWithEngagement.sort((a, b) => {
        return b.total_engagement - a.total_engagement;
      });

      const total = count || 0;

      return {
        success: true,
        data: {
          stories: sortedStories,
          total,
          page,
          limit
        }
      };
    } catch (error) {
      console.log('Error in getTrendingStories:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getEpisodeAccess: async (userId: string, storyId: string, episodeId: string) => {
    try {
      // Get episode details
      const { data: episode, error: episodeError } = await supabase
        .from('soul_story_episodes')
        .select('*')
        .eq('id', episodeId)
        .eq('soul_story_id', storyId)
        .single();

      if (episodeError || !episode) {
        return { success: false, message: 'Episode not found' };
      }

      // Increment view count for the episode
      await supabase
        .from('soul_story_episodes')
        .update({ total_views: (episode.total_views || 0) + 1 })
        .eq('id', episodeId);

      // Also increment story view count
      await supabase
        .from('soul_stories')
        .update({ total_views: (episode.total_views || 0) + 1 })
        .eq('id', storyId);

      return { success: true, data: episode };
    } catch (error) {
      console.log('Error in getEpisodeAccess:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  boostSoulStory: async (userId: string, storyId: string, boostType: 'weekly' | 'monthly') => {
    try {
      // Boost costs and durations
      const boostConfig = {
        weekly: { cost: 100, duration: 7 * 24 * 60 * 60 * 1000 }, // 7 days
        monthly: { cost: 300, duration: 30 * 24 * 60 * 60 * 1000 } // 30 days
      };

      const config = boostConfig[boostType];
      if (!config) {
        return { success: false, message: 'Invalid boost type. Use weekly or monthly' };
      }

      // Check if user has enough coins
      const { data: userCoins, error: coinsError } = await supabase
        .from('anamcoins')  // ← Use anamcoins (where you have 139 coins)
        .select('available_coins, spent_coins, total_coins')  // ← Use available_coins field
        .eq('user_id', userId)
        .single();

      if (coinsError || !userCoins || userCoins.available_coins < config.cost) {
        return { success: false, message: 'Insufficient coins' };
      }

      // Check if story exists and belongs to user
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select('*')
        .eq('id', storyId)
        .eq('author_id', userId)
        .single();

      if (storyError || !story) {
        return { success: false, message: 'Story not found or not authorized' };
      }

      // Calculate boost end date
      const boostEnd = new Date(Date.now() + config.duration);

      // Create boost record
      const { error: boostError } = await supabase
        .from('soul_story_boosts')
        .insert([{
          story_id: storyId,
          user_id: userId,
          boost_type: boostType,
          boost_cost: config.cost,
          boost_end: boostEnd.toISOString()
        }]);

      if (boostError) {
        return { success: false, message: boostError.message };
      }

      // Update story with boost status
      const { error: storyUpdateError } = await supabase
        .from('soul_stories')
        .update({
          is_boosted: true,
          boost_end_date: boostEnd.toISOString(),
          boost_type: boostType
        })
        .eq('id', storyId);

      if (storyUpdateError) {
        return { success: false, message: storyUpdateError.message };
      }

      // Deduct coins from user
      const { error: deductError } = await supabase
        .from('anamcoins')
        .update({ 
          available_coins: userCoins.available_coins - config.cost,
          spent_coins: (userCoins.spent_coins || 0) + config.cost  // Add to spent_coins
        })
        .eq('user_id', userId);

      if (deductError) {
        console.log('Coin deduction error:', deductError);
        return { success: false, message: 'Failed to deduct coins' };
      }

      return { 
        success: true, 
        message: `Story boosted for ${boostType} successfully`,
        data: {
          boost_type: boostType,
          boost_cost: config.cost,
          boost_end: boostEnd,
          remaining_coins: userCoins.available_coins - config.cost  // ← Use available_coins
        }
      };
    } catch (error) {
      console.log('Error in boostSoulStory:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getUserSoulStoryBoosts: async (userId: string) => {
    try {
      const { data: boosts, error } = await supabase
        .from('soul_story_boosts')
        .select(`
          *,
          story:soul_stories(
            id,
            title,
            thumbnail_url
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, message: error.message };
      }

      return { success: true, data: boosts || [] };
    } catch (error) {
      console.log('Error in getUserSoulStoryBoosts:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getProductDetails: async (storyId: string) => {
    try {
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select(`
          *,
          author:profiles!soul_stories_author_id_fkey(
            id,
            first_name,
            last_name,
            avatar_url
          )
        `)
        .eq('id', storyId)
        .single();

      if (storyError || !story) {
        return { success: false, message: 'Story not found' };
      }

      // Get earned coins for this story
      const { data: earnedCoins, error: coinsError } = await supabase
        .from('user_content_purchases')
        .select('coins_paid')
        .eq('story_id', storyId);

      const totalEarnedCoins = earnedCoins?.reduce((sum, purchase) => sum + (purchase.coins_paid || 0), 0) || 0;

      // Get boost status
      const { data: boostData, error: boostError } = await supabase
        .from('soul_story_boosts')
        .select('*')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const isBoosted = boostData && new Date(boostData.boost_end) > new Date();
      const boostType = isBoosted ? boostData.boost_type : null;
      const boostEndDate = isBoosted ? boostData.boost_end : null;

      // Determine file type
      let fileType = 'unknown';
      if (story.asset_type === 'video') {
        fileType = 'video';
      } else if (story.asset_type === 'document') {
        fileType = 'pdf';
      } else if (story.story_type === 'episodes') {
        fileType = 'video';
      }

      const productDetails = {
        id: story.id,
        title: story.title,
        description: story.description,
        creator_name: `${story.author?.first_name || ''} ${story.author?.last_name || ''}`.trim(),
        creator_avatar: story.author?.avatar_url,
        price: story.price || 0,
        free_pages: story.free_pages || 0,
        free_episodes: story.free_episodes || 0,
        remix_status: story.remix || false,
        earned_coins: totalEarnedCoins,
        file_type: fileType,
        boost_status: {
          is_boosted: isBoosted,
          boost_type: boostType,
          boost_end_date: boostEndDate
        },
        category: story.category,
        story_type: story.story_type,
        monetization_type: story.monetization_type,
        thumbnail_url: story.thumbnail_url,
        created_at: story.created_at,
        updated_at: story.updated_at
      };

      return {
        success: true,
        data: productDetails
      };

    } catch (error) {
      console.error('Error in getProductDetails service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getAllUsersStoriesData: async () => {
    try {
      // Get all users
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          avatar_url,
          email,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (usersError) {
        return { success: false, message: 'Failed to fetch users' };
      }

      const usersData = [];

      for (const user of users || []) {
        // Get user's stories
        const { data: stories, error: storiesError } = await supabase
          .from('soul_stories')
          .select('*')
          .eq('author_id', user.id);

        if (storiesError) continue;

        const userStories = stories || [];
        
        // Calculate statistics for this user
        const totalStories = userStories.length;
        const publishedStories = userStories.filter(story => story.status === 'published').length;
        const remixCount = userStories.filter(story => story.remix === true).length;
        const freeEpisodesCount = userStories.reduce((sum, story) => sum + (story.free_episodes || 0), 0);
        const freePagesCount = userStories.reduce((sum, story) => sum + (story.free_pages || 0), 0);
        
        // Count video and PDF stories
        const videoStories = userStories.filter(story => 
          story.asset_type === 'video' || story.story_type === 'episodes'
        ).length;
        const pdfStories = userStories.filter(story => 
          story.asset_type === 'document'
        ).length;

        // Get boost count for this user
        const { data: boosts, error: boostsError } = await supabase
          .from('soul_story_boosts')
          .select('*')
          .eq('user_id', user.id);

        const boostCount = boosts?.length || 0;
        const activeBoosts = boosts?.filter(boost => 
          new Date(boost.boost_end) > new Date()
        ).length || 0;

        // Calculate total revenue from all stories
        const { data: purchases, error: purchasesError } = await supabase
          .from('user_content_purchases')
          .select('coins_paid')
          .in('story_id', userStories.map(story => story.id));

        const totalRevenue = purchases?.reduce((sum, purchase) => 
          sum + (purchase.coins_paid || 0), 0
        ) || 0;

        usersData.push({
          user_id: user.id,
          user_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Anonymous',
          user_email: user.email,
          user_avatar: user.avatar_url,
          user_created_at: user.created_at,
          totals: {
            total_stories: totalStories,
            published_stories: publishedStories,
            draft_stories: totalStories - publishedStories,
            remix_count: remixCount,
            original_stories: totalStories - remixCount,
            boost_count: boostCount,
            active_boosts: activeBoosts,
            free_episodes_count: freeEpisodesCount,
            free_pages_count: freePagesCount,
            video_stories: videoStories,
            pdf_stories: pdfStories,
            total_revenue: totalRevenue
          }
        });
      }

      return {
        success: true,
        data: {
          users: usersData
        }
      };

    } catch (error) {
      console.error('Error in getAllUsersStoriesData service:', error);
      return { success: false, message: 'Internal server error' };
    }
  }
};

