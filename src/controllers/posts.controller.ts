import { Request, Response } from 'express';
import { supabase } from '../app';

// Create a new post
export const createPost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Please login to create a post'
      });
    }

    const {
      content,
      mediaUrl,
      mediaType,
      feelingEmoji,
      feelingLabel,
      feelingType,
      questionCategory,
      questionTitle,
      questionDescription,
      questionColor,
      pollOptions
    } = req.body;

    // Validate required fields based on post type
    if (pollOptions && pollOptions.length > 0) {
      if (!Array.isArray(pollOptions) || pollOptions.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Poll must have at least 2 options'
        });
      }
    } else if (questionCategory) {
      if (!questionTitle) {
        return res.status(400).json({
          success: false,
          message: 'Question title is required for question posts'
        });
      }
    } else if (!content && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Post content or media is required'
      });
    }

    // Determine post type
    let postType: 'regular' | 'question' | 'poll' = 'regular';
    if (pollOptions && pollOptions.length > 0) {
      postType = 'poll';
    } else if (questionCategory) {
      postType = 'question';
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content,
        media_url: mediaUrl,
        media_type: mediaType,
        post_type: postType,
        feeling_emoji: feelingEmoji,
        feeling_label: feelingLabel,
        feeling_type: feelingType,
        question_category: questionCategory,
        question_title: questionTitle,
        question_description: questionDescription,
        question_color: questionColor,
        poll_options: pollOptions
      })
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        )
      `)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating post'
    });
  }
};

// Get posts with pagination
export const getPosts = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;

    if (limit > 50) {
      return res.status(400).json({
        success: false,
        message: 'Limit cannot exceed 50 posts per request'
      });
    }

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        hasMore: data?.length === limit
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching posts'
    });
  }
};

// Get posts by user
export const getUserPosts = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;

    if (limit > 50) {
      return res.status(400).json({
        success: false,
        message: 'Limit cannot exceed 50 posts per request'
      });
    }

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        hasMore: data?.length === limit
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching user posts'
    });
  }
};

// Get trending posts
export const getTrendingPosts = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    if (limit > 50) {
      return res.status(400).json({
        success: false,
        message: 'Limit cannot exceed 50 posts per request'
      });
    }

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        )
      `)
      .eq('is_active', true)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('likes_count', { ascending: false })
      .order('comments_count', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching trending posts'
    });
  }
};

// Get single post
export const getPost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        )
      `)
      .eq('id', postId)
      .eq('is_active', true)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching post'
    });
  }
};

// Toggle post like
export const togglePostLike = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { postId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Please login to like posts'
      });
    }

    // Check if already liked
    const { data: existingLike } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .single();

    if (existingLike) {
      // Unlike
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);

      if (error) {
        return res.status(500).json({
          success: false,
          message: error.message
        });
      }

      res.status(200).json({
        success: true,
        message: 'Post unliked successfully',
        liked: false
      });
    } else {
      // Like
      const { error } = await supabase
        .from('post_likes')
        .insert({
          post_id: postId,
          user_id: userId
        });

      if (error) {
        return res.status(500).json({
          success: false,
          message: error.message
        });
      }

      res.status(200).json({
        success: true,
        message: 'Post liked successfully',
        liked: true
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error toggling post like'
    });
  }
};

// Add comment to post
export const addComment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { postId } = req.params;
    const { content, parentCommentId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Please login to comment'
      });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }

    const { data, error } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        user_id: userId,
        content: content.trim(),
        parent_comment_id: parentCommentId || null
      })
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error adding comment'
    });
  }
};

// Get post comments
export const getPostComments = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;

    const { data, error } = await supabase
      .from('post_comments')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching comments'
    });
  }
};

// Vote on poll
export const voteOnPoll = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { postId } = req.params;
    const { optionIndex } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Please login to vote'
      });
    }

    if (typeof optionIndex !== 'number' || optionIndex < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid option index is required'
      });
    }

    // Verify it's a poll post
    const { data: post } = await supabase
      .from('posts')
      .select('post_type, poll_options')
      .eq('id', postId)
      .single();

    if (!post || post.post_type !== 'poll') {
      return res.status(400).json({
        success: false,
        message: 'This is not a poll post'
      });
    }

    if (!post.poll_options || optionIndex >= post.poll_options.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option index'
      });
    }

    // Check if user already voted
    const { data: existingVote } = await supabase
      .from('poll_votes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .single();

    if (existingVote) {
      // Update existing vote
      const { data, error } = await supabase
        .from('poll_votes')
        .update({ option_index: optionIndex })
        .eq('post_id', postId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          success: false,
          message: error.message
        });
      }

      res.status(200).json({
        success: true,
        message: 'Vote updated successfully',
        data
      });
    } else {
      // Insert new vote
      const { data, error } = await supabase
        .from('poll_votes')
        .insert({
          post_id: postId,
          user_id: userId,
          option_index: optionIndex
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          success: false,
          message: error.message
        });
      }

      res.status(201).json({
        success: true,
        message: 'Vote recorded successfully',
        data
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error voting on poll'
    });
  }
};

// Get poll results
export const getPollResults = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;

    // Verify it's a poll post
    const { data: post } = await supabase
      .from('posts')
      .select('post_type, poll_options')
      .eq('id', postId)
      .single();

    if (!post || post.post_type !== 'poll') {
      return res.status(400).json({
        success: false,
        message: 'This is not a poll post'
      });
    }

    const { data, error } = await supabase
      .from('poll_votes')
      .select('option_index')
      .eq('post_id', postId);

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    // Count votes for each option
    const voteCounts: { [key: number]: number } = {};
    data?.forEach((vote) => {
      voteCounts[vote.option_index] = (voteCounts[vote.option_index] || 0) + 1;
    });

    const totalVotes = data?.length || 0;

    // Format results with percentages
    const results = post.poll_options.map((option: string, index: number) => ({
      option,
      votes: voteCounts[index] || 0,
      percentage: totalVotes > 0 ? Math.round(((voteCounts[index] || 0) / totalVotes) * 100) : 0
    }));

    res.status(200).json({
      success: true,
      data: {
        results,
        totalVotes
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching poll results'
    });
  }
};

// Delete post (soft delete)
export const deletePost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { postId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Please login to delete posts'
      });
    }

    const { error } = await supabase
      .from('posts')
      .update({ is_active: false })
      .eq('id', postId)
      .eq('user_id', userId);

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting post'
    });
  }
};

// Update post
export const updatePost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { postId } = req.params;
    const { content, mediaUrl, mediaType } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Please login to update posts'
      });
    }

    if (!content && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Post content or media is required'
      });
    }

    const { data, error } = await supabase
      .from('posts')
      .update({
        content,
        media_url: mediaUrl,
        media_type: mediaType,
        updated_at: new Date().toISOString()
      })
      .eq('id', postId)
      .eq('user_id', userId)
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        )
      `)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or you do not have permission to update it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Post updated successfully',
      data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating post'
    });
  }
};