import { supabase } from '../app';
import { searchAllContent } from '../controllers/soulStories/soulStories.controlller';

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
          monetization_type: story.monetization_type
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

      return {
        stories: transformedStories,
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
        .select('id, title, category, story_type, asset_type, free_pages, free_episodes')
        .eq('id', storyId)
        .single();
  
      if (storyError || !story) {
        throw new Error('Story not found');
      }
  
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
      throw error;
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
  }
};

