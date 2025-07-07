import { Request, Response } from 'express';
import { supabase } from '../app';
import { sendNotification } from '../sockets/emitNotification';


type PostReactionType = 'like' | 'dislike' | 'insightful' | 'heart' | 'hug' | 'soul';

type PostFieldMap = {
  [key in PostReactionType]: 'total_likes' | 'total_dislikes' | 'total_insightfuls' | 'total_hearts' | 'total_hugs' | 'total_souls';
};

const postFieldMap: PostFieldMap = {
  like: 'total_likes',
  dislike: 'total_dislikes',
  insightful: 'total_insightfuls',
  heart: 'total_hearts',
  hug: 'total_hugs',
  soul: 'total_souls',
};


// Toggle post reaction (using thread_reactions table with post_id)
export const updatePostReaction = async (
  req: Request<{ postId: string }, {}, { type: PostReactionType }>,
  res: Response
): Promise<any> => {
  const { postId } = req.params;
  const { type } = req.body;
  const { id: user_id } = req.user!;

  if (!user_id || !postFieldMap[type]) {
    return res.status(400).json({ error: 'Invalid user or reaction type.' });
  }

  // Check for existing reaction
  const { data: existing, error: fetchError } = await supabase
    .from('thread_reactions')
    .select('*')
    .eq('user_id', user_id)
    .eq('target_id', postId)
    .eq('target_type', 'post')
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    return res.status(500).json({ error: fetchError.message });
  }

  // Get post and author
  const { data: postData, error: postError } = await supabase
    .from('posts')
    .select('user_id, content, total_likes, total_dislikes, total_insightfuls, total_hearts, total_hugs, total_souls')
    .eq('id', postId)
    .single();

  if (postError || !postData) {
    return res.status(404).json({ error: 'Post not found!' });
  }

  const shouldSendNotification = postData.user_id !== user_id;

  let authorProfile = null;
  if (shouldSendNotification) {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', postData.user_id)
      .single();

    if (!profileError && profileData) {
      authorProfile = profileData;
    }
  }

  // Prepare update fields
  const updates = {
    total_likes: postData.total_likes ?? 0,
    total_dislikes: postData.total_dislikes ?? 0,
    total_insightfuls: postData.total_insightfuls ?? 0,
    total_hearts: postData.total_hearts ?? 0,
    total_hugs: postData.total_hugs ?? 0,
    total_souls: postData.total_souls ?? 0,
  };

  const getReactionDisplayName = (reactionType: PostReactionType): string => {
    const displayNames: Record<PostReactionType, string> = {
      'like': 'like',
      'dislike': 'dislike',
      'insightful': 'insightful reaction',
      'heart': 'heart',
      'hug': 'hug',
      'soul': 'soul reaction'
    };
    return displayNames[reactionType] || reactionType;
  };

  if (existing) {
    if (existing.type === type) {
      // Remove reaction
      const field = postFieldMap[type];
      updates[field] = Math.max(0, updates[field] - 1);

      const { error: deleteError } = await supabase
        .from('thread_reactions')
        .delete()
        .eq('id', existing.id);

      if (deleteError) return res.status(500).json({ error: deleteError.message });

      const { error: updatePostError } = await supabase
        .from('posts')
        .update({ [field]: updates[field] })
        .eq('id', postId);

      if (updatePostError) return res.status(500).json({ error: updatePostError.message });

      if (shouldSendNotification && authorProfile) {
        await sendNotification({
          recipientEmail: authorProfile.email,
          recipientUserId: postData.user_id,
          actorUserId: user_id,
          threadId: postId,
          message: `_${getReactionDisplayName(type)}_ reaction was removed from your post.`,
          type: 'post_reaction_removed',
          metadata: {
            reaction_type: type,
            post_id: postId,
            actor_user_id: user_id
          }
        });
      }

      return res.status(200).json({ message: `${type} removed!` });
    }

    // Change reaction
    const prevField = postFieldMap[existing.type as PostReactionType];
    const currentField = postFieldMap[type];

    updates[prevField] = Math.max(0, updates[prevField] - 1);
    updates[currentField] += 1;

    const { error: updateReactionError } = await supabase
      .from('thread_reactions')
      .update({ type, updated_by: user_id })
      .eq('id', existing.id);

    if (updateReactionError) return res.status(500).json({ error: updateReactionError.message });

    const { error: updatePostError } = await supabase
      .from('posts')
      .update({
        [prevField]: updates[prevField],
        [currentField]: updates[currentField],
      })
      .eq('id', postId);

    if (updatePostError) return res.status(500).json({ error: updatePostError.message });

    if (shouldSendNotification && authorProfile) {
      await sendNotification({
        recipientEmail: authorProfile.email,
        recipientUserId: postData.user_id,
        actorUserId: user_id,
        threadId: postId,
        message: `**@someone** changed their reaction to _${getReactionDisplayName(type)}_ on your post.`,
        type: 'post_reaction_updated',
        metadata: {
          previous_reaction_type: existing.type,
          new_reaction_type: type,
          post_id: postId,
          actor_user_id: user_id
        }
      });
    }

    return res.status(200).json({ message: `Reaction updated to ${type}!` });
  } else {
    // Add new reaction
    const field = postFieldMap[type];
    updates[field] += 1;

    const { error: insertError } = await supabase
      .from('thread_reactions')
      .insert([{ user_id, target_id: postId, target_type: 'post', type }]);

    if (insertError) return res.status(500).json({ error: insertError.message });

    const { error: updatePostError } = await supabase
      .from('posts')
      .update({ [field]: updates[field] })
      .eq('id', postId);

    if (updatePostError) return res.status(500).json({ error: updatePostError.message });

    if (shouldSendNotification && authorProfile) {
      // Soulpoints logic
      const soulpointsMap: Record<PostReactionType, number> = {
        'like': 2,
        'dislike': 0,
        'insightful': 3,
        'heart': 4,
        'hug': 2,
        'soul': 2
      };
      const soulpoints = soulpointsMap[type] || 0;

      await sendNotification({
        recipientEmail: authorProfile.email,
        recipientUserId: postData.user_id,
        actorUserId: user_id,
        threadId: postId,
        message: `**@someone** reacted with _${getReactionDisplayName(type)}_ on your post. +${soulpoints} soulpoints added!`,
        type: 'post_reaction_added',
        metadata: {
          reaction_type: type,
          post_id: postId,
          actor_user_id: user_id,
          soulpoints
        }
      });
    }

    return res.status(200).json({ message: `${type} added!` });
  }
};


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

    // Send notification for post creation
    const { data: profileData } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (profileData) {
      await sendNotification({
        recipientEmail: profileData.email,
        recipientUserId: userId,
        actorUserId: null,
        threadId: data.id,
        message: 'Post created successfully! +5 soulpoints added to your profile',
        type: 'post_creation',
        metadata: {
          soulpoints: 5,
          post_id: data.id,
          post_type: postType
        }
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
    const user_id = req.user?.id;

    if (limit > 50) {
      return res.status(400).json({
        success: false,
        message: 'Limit cannot exceed 50 posts per request'
      });
    }

    const { data: allPosts, error } = await supabase
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

    // Add user reactions and comment counts
    const postsWithReactions = await Promise.all(allPosts.map(async (post) => {
      let userReaction = null;

      if (user_id) {
        const { data: reactionData } = await supabase
          .from('thread_reactions')
          .select('type')
          .eq('user_id', user_id)
          .eq('post_id', post.id)
          .eq('target_type', 'post')
          .maybeSingle();

        if (reactionData) {
          userReaction = reactionData.type;
        }
      }

      // Get comment count using threadcomments table with post_id
      const { data: comments } = await supabase
        .from('threadcomments')
        .select('id, post_id, content, is_deleted')
        .eq('post_id', post.id)
        .eq('is_deleted', false);

      const commentIds = comments?.map(c => c.id) || [];

      // Get subcomments/replies count
      const subcommentsResults = await Promise.all(
        commentIds.map(commentId =>
          supabase
            .from('threadsubcomments')
            .select('id')
            .eq('comment_id', commentId)
            .eq('is_deleted', false)
        )
      );

      const totalComments = comments?.length || 0;
      const totalReplies = subcommentsResults.reduce((sum, result) => sum + (result.data?.length || 0), 0);

      return {
        ...post,
        user_reaction: userReaction,
        total_comments: totalComments + totalReplies,
      };
    }));

    res.status(200).json({
      success: true,
      data: postsWithReactions,
      pagination: {
        page,
        limit,
        hasMore: allPosts?.length === limit
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching posts'
    });
  }
};

export const addComment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { postId } = req.params;
    const { content } = req.body;

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

    // Get user profile for comment
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, avatar_url')
      .eq('id', userId)
      .single();

    const { data, error } = await supabase
      .from('threadcomments')
      .insert({
        post_id: postId,
        user_id: userId,
        content: content.trim(),
        
       
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    // Send notification to post author
    const { data: postData } = await supabase
      .from('posts')
      .select('user_id, content')
      .eq('id', postId)
      .single();

    if (postData && postData.user_id !== userId) {
      const { data: authorProfile } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', postData.user_id)
        .single();

      if (authorProfile) {
        await sendNotification({
          recipientEmail: authorProfile.email,
          recipientUserId: postData.user_id,
          actorUserId: userId,
         threadId: postId,
          message: `**@someone** commented on your post. +2 soulpoints added!`,
          type: 'post_comment_added',
          metadata: {
            comment_id: data.id,
            post_id: postId,
            actor_user_id: userId,
            soulpoints: 2
          }
        });
      }
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

export const addReply = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { commentId } = req.params;
    const { content } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Please login to reply'
      });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Reply content is required'
      });
    }

    // Get user profile for reply
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, avatar_url')
      .eq('id', userId)
      .single();

    const { data, error } = await supabase
      .from('threadsubcomments')
      .insert({
        comment_id: commentId,
        user_id: userId,
        content: content.trim(),
        
       
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    // Get comment and post info for notification
    const { data: commentData } = await supabase
      .from('threadcomments')
      .select('user_id, post_id')
      .eq('id', commentId)
      .single();

    if (commentData) {
      // Send notification to comment author
      if (commentData.user_id !== userId) {
        const { data: commentAuthorProfile } = await supabase
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('id', commentData.user_id)
          .single();

        if (commentAuthorProfile) {
          await sendNotification({
            recipientEmail: commentAuthorProfile.email,
            recipientUserId: commentData.user_id,
            actorUserId: userId,
            threadId: commentData.post_id,
            message: `**@someone** replied to your comment. +1 soulpoint added!`,
            type: 'post_reply_added',
            metadata: {
              reply_id: data.id,
              comment_id: commentId,
              post_id: commentData.post_id,
              actor_user_id: userId,
              soulpoints: 1
            }
          });
        }
      }

      // Also send notification to post author if different from comment author
      const { data: postData } = await supabase
        .from('posts')
        .select('user_id')
        .eq('id', commentData.post_id)
        .single();

      if (postData && postData.user_id !== userId && postData.user_id !== commentData.user_id) {
        const { data: postAuthorProfile } = await supabase
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('id', postData.user_id)
          .single();

        if (postAuthorProfile) {
          await sendNotification({
            recipientEmail: postAuthorProfile.email,
            recipientUserId: postData.user_id,
            actorUserId: userId,
            threadId: commentData.post_id,
            message: `**@someone** replied to a comment on your post.`,
            type: 'post_reply_added',
            metadata: {
              reply_id: data.id,
              comment_id: commentId,
              post_id: commentData.post_id,
              actor_user_id: userId
            }
          });
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error adding reply'
    });
  }
};

// Get post comments with nested replies (using threadcomments and threadsubcomments)
export const getPostComments = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;

    const { data: comments, error } = await supabase
      .from('threadcomments')
      .select('*')
      .eq('post_id', postId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    // Get replies for each comment
    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        const { data: replies } = await supabase
          .from('threadsubcomments')
          .select('*')
          .eq('comment_id', comment.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: true });

        return {
          ...comment,
          replies: replies || []
        };
      })
    );

    res.status(200).json({
      success: true,
      data: commentsWithReplies
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching comments'
    });
  }
};

// Get posts by user
export const getUserPosts = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;
    const current_user_id = req.user?.id;

    if (limit > 50) {
      return res.status(400).json({
        success: false,
        message: 'Limit cannot exceed 50 posts per request'
      });
    }

    const { data: posts, error } = await supabase
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

    // Add user reactions and comment counts
    const postsWithReactions = await Promise.all(posts.map(async (post) => {
      let userReaction = null;

      if (current_user_id) {
        const { data: reactionData } = await supabase
          .from('thread_reactions')
          .select('type')
          .eq('user_id', current_user_id)
          .eq('post_id', post.id)
          .eq('target_type', 'post')
          .maybeSingle();

        if (reactionData) {
          userReaction = reactionData.type;
        }
      }

      // Get comment count
      const { data: comments } = await supabase
        .from('threadcomments')
        .select('id, post_id, content, is_deleted')
        .eq('post_id', post.id)
        .eq('is_deleted', false);

      const commentIds = comments?.map(c => c.id) || [];

      const subcommentsResults = await Promise.all(
        commentIds.map(commentId =>
          supabase
            .from('threadsubcomments')
            .select('id')
            .eq('comment_id', commentId)
            .eq('is_deleted', false)
        )
      );

      const totalComments = comments?.length || 0;
      const totalReplies = subcommentsResults.reduce((sum, result) => sum + (result.data?.length || 0), 0);

      return {
        ...post,
        user_reaction: userReaction,
        total_comments: totalComments + totalReplies,
      };
    }));

    res.status(200).json({
      success: true,
      data: postsWithReactions,
      pagination: {
        page,
        limit,
        hasMore: posts?.length === limit
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
      .order('total_likes', { ascending: false })
      .order('total_comments', { ascending: false })
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
      .select('post_type, poll_options, user_id')
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

      // Send notification to poll creator
      if (post.user_id !== userId) {
        const { data: authorProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', post.user_id)
          .single();

        if (authorProfile) {
          await sendNotification({
            recipientEmail: authorProfile.email,
            recipientUserId: post.user_id,
            actorUserId: userId,
            threadId: postId,
            message: `**@someone** voted on your poll. +1 soulpoint added!`,
            type: 'poll_vote_added',
            metadata: {
              post_id: postId,
              actor_user_id: userId,
              option_index: optionIndex,
              soulpoints: 1
            }
          });
        }
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