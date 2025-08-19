import { supabase } from '../app';

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
  }
};
