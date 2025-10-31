import { Request, Response } from 'express';
import { supabase } from '../app';
import { sendNotification } from '../sockets/emitNotification';
import { allocateSoulpointsForPost, checkChamberPermission, createPostInDatabase, determinePostType, sendPostCreationNotification, updateUserSoulpoints, validatePostRequest } from '../services/posts.service';
import { notifyChamberMembers } from '../sockets/manageChambers';

type PostReactionType = 'like' | 'dislike' | 'insightful' | 'heart' | 'hug' | 'soul' | 'support' | 'valuable' | 'funny' | 'shocked' | 'moved' | 'triggered';

type VoteType = 'upvote' | 'downvote';
type VoteTargetType = 'post' | 'thread' | 'story';

interface PostVote {
  id: string;
  user_id: string;
  target_id: string;
  target_type: VoteTargetType;
  vote_type: VoteType;
  created_at: string;
  updated_at: string;
}

type PostFieldMap = {
  [key in PostReactionType]:
  | 'total_likes' | 'total_dislikes' | 'total_insightfuls' | 'total_hearts' | 'total_hugs' | 'total_souls'
  | 'total_supports' | 'total_valuables' | 'total_funnies' | 'total_shockeds' | 'total_moveds' | 'total_triggereds';
};

const postFieldMap: PostFieldMap = {
  like: 'total_likes',
  dislike: 'total_dislikes',
  insightful: 'total_insightfuls',
  heart: 'total_hearts',
  hug: 'total_hugs',
  soul: 'total_souls',
  support: 'total_supports',
  valuable: 'total_valuables',
  funny: 'total_funnies',
  shocked: 'total_shockeds',
  moved: 'total_moveds',
  triggered: 'total_triggereds'
};

const soulpointsMap: Record<PostReactionType, number> = {
  'like': 2,
  'dislike': 0,
  'insightful': 3,
  'heart': 4,
  'hug': 2,
  'soul': 2,
  'support': 3,
  'valuable': 4,
  'funny': 2,
  'shocked': 1,
  'moved': 3,
  'triggered': 1
};

const getReactionDisplayName = (reactionType: PostReactionType): string => {
  const displayNames: Record<PostReactionType, string> = {
    'like': 'like',
    'dislike': 'dislike',
    'insightful': 'insightful reaction',
    'heart': 'heart',
    'hug': 'hug',
    'soul': 'soul reaction',
    'support': 'support',
    'valuable': 'valuable reaction',
    'funny': 'funny reaction',
    'shocked': 'shocked reaction',
    'moved': 'moved reaction',
    'triggered': 'triggered reaction'
  };
  return displayNames[reactionType] || reactionType;
};

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

  const { data: postData, error: postError } = await supabase
    .from('posts')
    .select('user_id, content, total_likes, total_dislikes, total_insightfuls, total_hearts, total_hugs, total_souls, total_supports, total_valuables, total_funnies, total_shockeds, total_moveds, total_triggereds, is_chamber_post, chamber_id')
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

  const updates = {
    total_likes: postData.total_likes ?? 0,
    total_dislikes: postData.total_dislikes ?? 0,
    total_insightfuls: postData.total_insightfuls ?? 0,
    total_hearts: postData.total_hearts ?? 0,
    total_hugs: postData.total_hugs ?? 0,
    total_souls: postData.total_souls ?? 0,
    total_supports: postData.total_supports ?? 0,
    total_valuables: postData.total_valuables ?? 0,
    total_funnies: postData.total_funnies ?? 0,
    total_shockeds: postData.total_shockeds ?? 0,
    total_moveds: postData.total_moveds ?? 0,
    total_triggereds: postData.total_triggereds ?? 0,
  };

  if (existing) {
    if (existing.type === type) {
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
        message: `@${authorProfile.first_name}${authorProfile.last_name} changed their reaction to _${getReactionDisplayName(type)}_ on your post.`,
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
      let soulpoints = soulpointsMap[type] || 0;

      if (postData.is_chamber_post && postData.chamber_id) {
        const { data: chamberData, error: chamberError } = await supabase
          .from('custom_chambers')
          .select('monetization')
          .eq('id', postData.chamber_id)
          .single();

        if (!chamberError && chamberData && chamberData.monetization?.enabled) {
          soulpoints *= 2;
        }
      }

      if (soulpoints > 0) {
        const { error: soulpointsError } = await supabase.rpc('increment_soulpoints', {
          p_user_id: postData.user_id,
          p_points: soulpoints
        });

        if (soulpointsError) {
          console.error('Error updating SoulPoints:', soulpointsError);
        }
      }

      await sendNotification({
        recipientEmail: authorProfile.email,
        recipientUserId: postData.user_id,
        actorUserId: user_id,
        threadId: postId,
        message: `@${authorProfile.first_name}${authorProfile.last_name} reacted with _${getReactionDisplayName(type)}_ on your post. ${soulpoints > 0 ? `+${soulpoints} SoulPoints added!` : ''}`,
        type: 'post_reaction_added',
        metadata: {
          reaction_type: type,
          post_id: postId,
          actor_user_id: user_id,
          soulpoints,
          is_chamber_post: postData.is_chamber_post,
          chamber_id: postData.chamber_id
        }
      });
    }

    return res.status(200).json({ message: `${type} added!` });
  }
};

export const createPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: Please login to create a post'
      });
      return;
    }

    const {
      content,
      media_url,
      media_type,
      feeling_emoji,
      feeling_label,
      feeling_type,
      question_category,
      question_title,
      question_description,
      question_color,
      poll_options,
      embedded_items,
      is_chamber_post = false,
      chamber_id,
      disclaimers
    } = req.body;

    const validationErrors = validatePostRequest(req.body);
    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
      return;
    }

    if (disclaimers && !Array.isArray(disclaimers)) {
      res.status(400).json({
        success: false,
        message: 'Invalid disclaimers format. Must be an array.'
      });
      return;
    }

    if (disclaimers && disclaimers.length > 0) {
      const validDisclaimerTypes = ['ai_generated', 'sponsored', 'nsfw', 'kids'];
      const invalidDisclaimers = disclaimers.filter(
        (d: any) => !validDisclaimerTypes.includes(d.type) || typeof d.enabled !== 'boolean'
      );

      if (invalidDisclaimers.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid disclaimer format. Each disclaimer must have valid type and enabled status.'
        });
        return;
      }
    }

    if (is_chamber_post && chamber_id) {
      const hasPermission = await checkChamberPermission(chamber_id, userId);
      if (!hasPermission) {
        res.status(403).json({
          success: false,
          message: 'You do not have permission to post in this chamber'
        });
        return;
      }
    }

    const postType = determinePostType({
      poll_options,
      question_category,
      embedded_items
    });

    const enabledDisclaimers = disclaimers
      ? disclaimers.filter((d: any) => d.enabled === true)
      : null;

    const postData = {
      user_id: userId,
      content: content?.trim() || null,
      media_url: media_url || null,
      media_type: media_type || null,
      post_type: postType,
      feeling_emoji: feeling_emoji || null,
      feeling_label: feeling_label || null,
      feeling_type: feeling_type || null,
      question_category: question_category || null,
      question_title: question_title || null,
      question_description: question_description || null,
      question_color: question_color || null,
      poll_options: poll_options || null,
      embedded_items: embedded_items || null,
      is_chamber_post,
      chamber_id: is_chamber_post ? chamber_id : null,
      disclaimers: enabledDisclaimers && enabledDisclaimers.length > 0 ? enabledDisclaimers : null
    };

    const { data: post, error } = await createPostInDatabase(postData);

    if (error) {
      console.error('Database error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create post',
        error: error.message
      });
      return;
    }

    let allocatedPoints = 0;
    let chamberName = '';

    try {
      allocatedPoints = await allocateSoulpointsForPost(userId, is_chamber_post, chamber_id);
      if (is_chamber_post && chamber_id) {
        const { data: chamber } = await supabase
          .from('custom_chambers')
          .select('name')
          .eq('id', chamber_id)
          .single();
        chamberName = chamber?.name || '';
      }

      await sendPostCreationNotification(userId, post.id, postType, allocatedPoints, is_chamber_post, chamberName);
    } catch (notificationError) {
      console.error('Failed to send notification, but post was created:', notificationError);
    }

    if (is_chamber_post && chamber_id) {
      try {
        await notifyChamberMembers(chamber_id, post.id, userId);
      } catch (chamberError) {
        console.error('Failed to notify chamber members:', chamberError);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: {
        ...post,
        allocated_soulpoints: allocatedPoints,
        is_chamber_post: is_chamber_post,
        chamber_name: chamberName || undefined,
        disclaimers: enabledDisclaimers
      }
    });

  } catch (error: any) {
    console.error('Unexpected error in createPost:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getPosts = async (req: Request, res: Response): Promise<any> => {
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
          username,
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

    // Get all post IDs for batch operations
    const postIds = allPosts.map(post => post.id);

    // ✅ Batch fetch comments count for all posts
    const { data: commentsCount } = await supabase
      .from('threadcomments')
      .select('post_id, id')
      .in('post_id', postIds)
      .eq('is_deleted', false);

    // ✅ Batch fetch replies count for all comments
    const commentIds = commentsCount?.map(c => c.id) || [];
    const { data: repliesCount } = commentIds.length > 0
      ? await supabase
        .from('threadsubcomments')
        .select('comment_id')
        .in('comment_id', commentIds)
        .eq('is_deleted', false)
      : { data: null };

    // Create lookup maps for faster access
    const commentsCountMap = new Map();
    const repliesCountMap = new Map();

    // Count comments per post
    commentsCount?.forEach(comment => {
      const count = commentsCountMap.get(comment.post_id) || 0;
      commentsCountMap.set(comment.post_id, count + 1);
    });

    // Count replies per comment
    repliesCount?.forEach(reply => {
      const count = repliesCountMap.get(reply.comment_id) || 0;
      repliesCountMap.set(reply.comment_id, count + 1);
    });

    const postsWithReactions = await Promise.all(
      allPosts.map(async (post) => {
        let userReaction = null;
        let userVote = null;
        let userSaved = false;
        let savedId = null;
        let chamberInfo = null;

        if (user_id) {
          const [reactionResult, voteResult, savedResult] = await Promise.all([
            supabase
              .from('thread_reactions')
              .select('type')
              .eq('user_id', user_id)
              .eq('target_id', post.id)
              .eq('target_type', 'post')
              .maybeSingle(),
            supabase
              .from('post_votes')
              .select('vote_type')
              .eq('user_id', user_id)
              .eq('target_id', post.id)
              .eq('target_type', 'post')
              .maybeSingle(),
            supabase
              .from('saved_posts')
              .select('id')
              .eq('target_id', post.id)
              .eq('target_type', 'post')
              .eq('user_id', user_id)
              .maybeSingle()
          ]);

          userReaction = reactionResult.data?.type || null;
          userVote = voteResult.data?.vote_type || null;
          userSaved = !!savedResult.data;
          savedId = savedResult.data?.id || null;
        }

        // ✅ Get chamber info (if applicable)
        if (post.is_chamber_post && post.chamber_id) {
          const { data: chamberData } = await supabase
            .from('custom_chambers')
            .select('id, name, custom_url, logo, member_count, color_theme, is_public, monetization')
            .eq('id', post.chamber_id)
            .eq('is_active', true)
            .maybeSingle();

          chamberInfo = chamberData ? {
            id: chamberData.id,
            name: chamberData.name,
            logo: chamberData.logo,
            custom_url: chamberData.custom_url,
            member_count: chamberData.member_count,
            color_theme: chamberData.color_theme,
            is_public: chamberData.is_public,
            monetization: chamberData.monetization
          } : null;
        }

        const postComments = commentsCount?.filter(c => c.post_id === post.id) || [];
        const totalComments = postComments.length;
        const totalReplies = postComments.reduce((sum, comment) => {
          return sum + (repliesCountMap.get(comment.id) || 0);
        }, 0);

        return {
          ...post,
          user_reaction: userReaction,
          user_vote: userVote,
          user_saved: userSaved,
          saved_id: savedId,
          total_comments: totalComments + totalReplies, // Total comments count
          comments_count: totalComments, // Only main comments count
          replies_count: totalReplies, // Only replies count
          chamber: chamberInfo,
          total_upvotes: post.total_upvotes || 0,
          total_downvotes: post.total_downvotes || 0
        };
      })
    );

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

export const getSinglePost = async (req: Request, res: Response): Promise<any> => {
  try {
    const { postId } = req.params;
    const user_id = req.user?.id;

    if (!postId) {
      return res.status(400).json({
        success: false,
        message: 'Post ID is required'
      });
    }

    const { data: postData, error: postError } = await supabase
      .from('posts')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          username,
          email
        )
      `)
      .eq('id', postId)
      .eq('is_active', true)
      .single();

    if (postError || !postData) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    let userReaction = null;
    let userVote = null;
    let userSaved = false;
    let savedId = null;
    let chamberInfo = null;

    if (user_id) {
      const { data: reactionData } = await supabase
        .from('thread_reactions')
        .select('type')
        .eq('user_id', user_id)
        .eq('target_id', postData.id)
        .eq('target_type', 'post')
        .maybeSingle();

      if (reactionData) {
        userReaction = reactionData.type;
      }

      const { data: voteData } = await supabase
        .from('post_votes')
        .select('vote_type')
        .eq('user_id', user_id)
        .eq('target_id', postData.id)
        .eq('target_type', 'post')
        .maybeSingle();

      if (voteData) {
        userVote = voteData.vote_type;
      }

      const { data: savedData } = await supabase
        .from('saved_posts')
        .select('id')
        .eq('target_id', postData.id)
        .eq('target_type', 'post')
        .eq('user_id', user_id)
        .maybeSingle();

      if (savedData) {
        userSaved = true;
        savedId = savedData.id;
      }
    }

    if (postData.is_chamber_post && postData.chamber_id) {
      const { data: chamberData } = await supabase
        .from('custom_chambers')
        .select('id, name, custom_url, logo, member_count, color_theme, is_public, monetization')
        .eq('id', postData.chamber_id)
        .eq('is_active', true)
        .maybeSingle();

      if (chamberData) {
        chamberInfo = {
          id: chamberData.id,
          name: chamberData.name,
          logo: chamberData.logo,
          custom_url: chamberData.custom_url,
          member_count: chamberData.member_count,
          color_theme: chamberData.color_theme,
          is_public: chamberData.is_public,
          monetization: chamberData.monetization
        };
      }
    }

    const { data: comments, error: commentsError } = await supabase
      .from('threadcomments')
      .select(`
        *,
        profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          username,
          email
        )
      `)
      .eq('post_id', postData.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (commentsError) {
      return res.status(500).json({
        success: false,
        message: commentsError.message
      });
    }

    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        const { data: subcomments, error: subcommentsError } = await supabase
          .from('threadsubcomments')
          .select(`
            *,
            profiles (
              id,
              first_name,
              last_name,
              avatar_url,
              username,
              email
            )
          `)
          .eq('comment_id', comment.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: true });

        let commentUserReaction = null;
        if (user_id) {
          const { data: commentReactionData } = await supabase
            .from('thread_reactions')
            .select('type')
            .eq('user_id', user_id)
            .eq('target_id', comment.id)
            .eq('target_type', 'comment')
            .maybeSingle();

          if (commentReactionData) {
            commentUserReaction = commentReactionData.type;
          }
        }

        const subcommentsWithReactions = await Promise.all(
          (subcomments || []).map(async (subcomment) => {
            let subcommentUserReaction = null;
            if (user_id) {
              const { data: subcommentReactionData } = await supabase
                .from('thread_reactions')
                .select('type')
                .eq('user_id', user_id)
                .eq('target_id', subcomment.id)
                .eq('target_type', 'subcomment')
                .maybeSingle();

              if (subcommentReactionData) {
                subcommentUserReaction = subcommentReactionData.type;
              }
            }

            return {
              ...subcomment,
              user_reaction: subcommentUserReaction
            };
          })
        );

        return {
          ...comment,
          user_reaction: commentUserReaction,
          replies: subcommentsWithReactions || []
        };
      })
    );

    const totalCommentsCount = commentsWithReplies.reduce((total, comment) => {
      return total + 1 + (comment.replies?.length || 0);
    }, 0);

    const { data: reactionCounts } = await supabase
      .from('thread_reactions')
      .select('type')
      .eq('target_id', postData.id)
      .eq('target_type', 'post');

    const reactionStats = {
      total_likes: reactionCounts?.filter(r => r.type === 'like').length || 0,
      total_supports: reactionCounts?.filter(r => r.type === 'support').length || 0,
      total_valuables: reactionCounts?.filter(r => r.type === 'valuable').length || 0,
      total_funnies: reactionCounts?.filter(r => r.type === 'funny').length || 0,
      total_shockeds: reactionCounts?.filter(r => r.type === 'shocked').length || 0,
      total_moveds: reactionCounts?.filter(r => r.type === 'moved').length || 0,
      total_triggereds: reactionCounts?.filter(r => r.type === 'triggered').length || 0,
    };

    const { data: voteCounts } = await supabase
      .from('post_votes')
      .select('vote_type')
      .eq('target_id', postData.id)
      .eq('target_type', 'post');

    const voteStats = {
      total_upvotes: voteCounts?.filter(v => v.vote_type === 'upvote').length || 0,
      total_downvotes: voteCounts?.filter(v => v.vote_type === 'downvote').length || 0,
    };

    const { data: echoData } = await supabase
      .from('post_echos')
      .select('id')
      .eq('post_id', postData.id);

    const completePostData = {
      ...postData,
      user_reaction: userReaction,
      user_vote: userVote,
      user_saved: userSaved,
      saved_id: savedId,
      chamber: chamberInfo,
      comments_count: totalCommentsCount,
      comments: commentsWithReplies,
      ...reactionStats,
      // ...voteStats,
      total_echos: echoData?.length || 0,
      // total_upvotes: voteStats.total_upvotes,
      // total_downvotes: voteStats.total_downvotes,
      net_score: voteStats.total_upvotes - voteStats.total_downvotes
    };

    res.status(200).json({
      success: true,
      data: completePostData
    });
  } catch (error: any) {
    console.error('Error fetching single post:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching post'
    });
  }
};

export const addComment = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id!;
    const { postId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }

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

    const { data: postData } = await supabase
      .from('posts')
      .select('user_id, content, is_chamber_post, chamber_id')
      .eq('id', postId)
      .single();

    if (postData && postData.user_id !== userId) {
      const { data: authorProfile } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', postData.user_id)
        .single();

      if (authorProfile) {
        let soulpoints = 2;

        if (postData.is_chamber_post && postData.chamber_id) {
          const { data: chamberData } = await supabase
            .from('custom_chambers')
            .select('monetization')
            .eq('id', postData.chamber_id)
            .single();

          if (chamberData && chamberData.monetization?.enabled) {
            soulpoints *= 2;
          }
        }

        const { error: soulpointsError } = await supabase.rpc('increment_soulpoints', {
          p_user_id: postData.user_id,
          p_points: soulpoints
        });

        if (soulpointsError) {
          console.error('Error updating SoulPoints:', soulpointsError);
        }

        await sendNotification({
          recipientEmail: authorProfile.email,
          recipientUserId: postData.user_id,
          actorUserId: userId,
          threadId: postId,
          message: `@${authorProfile.first_name}${authorProfile.last_name} commented on your post. +${soulpoints} SoulPoints added!`,
          type: 'post_comment_added',
          metadata: {
            comment_id: data.id,
            post_id: postId,
            actor_user_id: userId,
            soulpoints: soulpoints,
            is_chamber_post: postData.is_chamber_post,
            chamber_id: postData.chamber_id
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

export const addReply = async (req: Request, res: Response): Promise<any> => {
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
            message: `@${commentAuthorProfile.first_name}${commentAuthorProfile.last_name}  replied to your comment. +1 SoulPoint added!`,
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
            message: `@${postAuthorProfile.first_name}${postAuthorProfile.last_name} replied to a comment on your post.`,
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

export const getPostComments = async (req: Request, res: Response): Promise<any> => {
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

export const getUserPosts = async (req: Request, res: Response): Promise<any> => {
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
          email,
          username
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('is_chamber_post', true)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    const postsWithReactions = await Promise.all(
      posts.map(async (post) => {
        let userReaction = null;
        let userVote = null;
        let userSaved = false;
        let savedId = null;

        if (current_user_id) {
          const { data: reactionData } = await supabase
            .from('thread_reactions')
            .select('type')
            .eq('user_id', current_user_id)
            .eq('target_id', post.id)
            .eq('target_type', 'post')
            .maybeSingle();

          if (reactionData) {
            userReaction = reactionData.type;
          }

          const { data: voteData } = await supabase
            .from('post_votes')
            .select('vote_type')
            .eq('user_id', current_user_id)
            .eq('target_id', post.id)
            .eq('target_type', 'post')
            .maybeSingle();

          if (voteData) {
            userVote = voteData.vote_type;
          }

          const { data: savedData } = await supabase
            .from('saved_posts')
            .select('id')
            .eq('target_id', post.id)
            .eq('target_type', 'post')
            .eq('user_id', current_user_id)
            .maybeSingle();

          if (savedData) {
            userSaved = true;
            savedId = savedData.id;
          }
        }

        const { data: comments } = await supabase
          .from('threadcomments')
          .select('id, post_id, content, is_deleted')
          .eq('post_id', post.id)
          .eq('is_deleted', false);

        const commentIds = comments?.map((c) => c.id) || [];

        const subcommentsResults = await Promise.all(
          commentIds.map((commentId) =>
            supabase
              .from('threadsubcomments')
              .select('id')
              .eq('comment_id', commentId)
              .eq('is_deleted', false)
          )
        );

        const totalComments = comments?.length || 0;
        const totalReplies = subcommentsResults.reduce(
          (sum, result) => sum + (result.data?.length || 0),
          0
        );

        return {
          ...post,
          user_reaction: userReaction,
          user_vote: userVote,
          user_saved: userSaved,
          saved_id: savedId,
          total_comments: totalComments + totalReplies,
          total_upvotes: post.total_upvotes || 0,
          total_downvotes: post.total_downvotes || 0
        };
      })
    );

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

export const getUserPostsMedia = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;

    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, media_url, media_type')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    const mediaData = posts.map((post) => {
      return {
        post_id: post.id,
        images: post.media_type === 'image' && post.media_url ? [post.media_url] : [],
        videos: post.media_type === 'video' && post.media_url ? [post.media_url] : [],
      };
    });

    res.status(200).json({
      success: true,
      data: mediaData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching user posts media',
    });
  }
};

export const getTrendingPosts = async (req: Request, res: Response): Promise<any> => {
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

export const voteOnPoll = async (req: Request, res: Response): Promise<any> => {
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
          .select('email , first_name ,last_name')
          .eq('id', post.user_id)
          .single();

        if (authorProfile) {
          await sendNotification({
            recipientEmail: authorProfile.email,
            recipientUserId: post.user_id,
            actorUserId: userId,
            threadId: postId,
            message: `@${authorProfile.first_name}${authorProfile.last_name} voted on your poll. +1 SoulPoint added!`,
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

export const getPollResults = async (req: Request, res: Response): Promise<any> => {
  try {
    const { postId } = req.params;

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

    const voteCounts: { [key: number]: number } = {};
    data?.forEach((vote) => {
      voteCounts[vote.option_index] = (voteCounts[vote.option_index] || 0) + 1;
    });

    const totalVotes = data?.length || 0;

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

export const deletePost = async (req: Request, res: Response): Promise<any> => {
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

export const updatePost = async (req: Request, res: Response): Promise<any> => {
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

export const updateVote = async (
  req: Request<{ targetId: string }, {}, { voteType: VoteType; targetType: VoteTargetType }>,
  res: Response
): Promise<any> => {
  const { targetId } = req.params;
  const { voteType, targetType } = req.body;
  const { id: user_id } = req.user!;

  if (!user_id || !['upvote', 'downvote'].includes(voteType) || !['post', 'thread', 'story'].includes(targetType)) {
    return res.status(400).json({ error: 'Invalid user, vote type, or target type.' });
  }

  const UPVOTE_WEIGHT = 20;
  const DOWNVOTE_WEIGHT = 1;

  try {
    let targetTable: string;
    let selectFields: string;
    
    switch (targetType) {
      case 'post':
        targetTable = 'posts';
        selectFields = 'total_upvotes, total_downvotes, user_id';
        break;
      case 'thread':
        targetTable = 'threads';
        selectFields = 'total_upvotes, total_downvotes, user_id';
        break;
      case 'story':
        targetTable = 'soul_stories';
        selectFields = 'total_upvotes, total_downvotes, author_id';
        break;
      default:
        return res.status(400).json({ error: 'Invalid target type.' });
    }

    const { data: existingVote, error: fetchError } = await supabase
      .from('post_votes')
      .select('*')
      .eq('user_id', user_id)
      .eq('target_id', targetId)
      .eq('target_type', targetType)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return res.status(500).json({ error: fetchError.message });
    }

    const { data: targetData, error: targetError } = await supabase
      .from(targetTable)
      .select(selectFields)
      .eq('id', targetId)
      .single();

    if (targetError || !targetData) {
      return res.status(404).json({ error: `${targetType} not found!` });
    }

    const currentUpvotes = Math.max(0, ((targetData as any).total_upvotes) || 0);
    const currentDownvotes = Math.max(0, ((targetData as any).total_downvotes) || 0);

    let newUpvotes = currentUpvotes;
    let newDownvotes = currentDownvotes;
    let user_vote: 'upvote' | 'downvote' | null = voteType;

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        // Remove vote
        const { error: deleteError } = await supabase
          .from('post_votes')
          .delete()
          .eq('id', existingVote.id);
        if (deleteError) return res.status(500).json({ error: deleteError.message });

        if (voteType === 'upvote') {
          newUpvotes = Math.max(0, currentUpvotes - UPVOTE_WEIGHT);
        } else {
          newDownvotes = Math.max(0, currentDownvotes - DOWNVOTE_WEIGHT);
        }

        user_vote = null;
      } else {
        const { error: updateError } = await supabase
          .from('post_votes')
          .update({ 
            vote_type: voteType, 
            updated_at: new Date().toISOString() 
          })
          .eq('id', existingVote.id);
        if (updateError) return res.status(500).json({ error: updateError.message });

        if (existingVote.vote_type === 'upvote') {
          newUpvotes = Math.max(0, currentUpvotes - UPVOTE_WEIGHT);
          newDownvotes = currentDownvotes + DOWNVOTE_WEIGHT;
        } else {
          newUpvotes = currentUpvotes + UPVOTE_WEIGHT;
          newDownvotes = Math.max(0, currentDownvotes - DOWNVOTE_WEIGHT);
        }
      }
    } else {
      const { error: insertError } = await supabase
        .from('post_votes')
        .insert([{
          user_id,
          target_id: targetId,
          target_type: targetType,
          vote_type: voteType
        }]);
      if (insertError) return res.status(500).json({ error: insertError.message });

      if (voteType === 'upvote') {
        newUpvotes = currentUpvotes + UPVOTE_WEIGHT;
      } else {
        const potentialNetScore = currentUpvotes - (currentDownvotes + DOWNVOTE_WEIGHT);
        if (potentialNetScore >= 0) {
          newDownvotes = currentDownvotes + DOWNVOTE_WEIGHT;
        } else {
          newDownvotes = currentDownvotes;
        }
      }
    }

    newUpvotes = Math.max(0, newUpvotes);
    newDownvotes = Math.max(0, newDownvotes);
    
    const netScore = newUpvotes - newDownvotes;
    if (netScore < 0) {
      newDownvotes = newUpvotes;
    }

    const { error: updateTargetError } = await supabase
      .from(targetTable)
      .update({
        total_upvotes: newUpvotes,
        total_downvotes: newDownvotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetId);
    if (updateTargetError) return res.status(500).json({ error: updateTargetError.message });

    const authorId = targetType === 'story' ? (targetData as any).author_id : (targetData as any).user_id;
    const shouldSendNotification = authorId && authorId !== user_id;

    if (shouldSendNotification) {
      try {
        const { data: authorProfile } = await supabase
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('id', authorId)
          .single();

        if (authorProfile) {
          const voteAction = existingVote ? 
            (existingVote.vote_type === voteType ? 'removed' : 'changed') : 
            'added';

          await sendNotification({
            recipientEmail: authorProfile.email,
            recipientUserId: authorId,
            actorUserId: user_id,
            threadId: targetId,
            message: `@${authorProfile.first_name} ${authorProfile.last_name} ${voteAction} ${voteType} on your ${targetType}.`,
            type: `${targetType}_vote_${voteAction}` as any,
            metadata: {
              vote_type: voteType,
              previous_vote_type: existingVote?.vote_type,
              target_id: targetId,
              target_type: targetType,
              actor_user_id: user_id
            }
          });
        }
      } catch (notificationError) {
        console.error('Error sending vote notification:', notificationError);
        // Don't fail the vote if notification fails
      }
    }

    return res.status(200).json({
      message: `${voteType} ${existingVote ? (existingVote.vote_type === voteType ? 'removed' : 'updated') : 'added'}!`,
      data: {
        total_upvotes: newUpvotes,
        total_downvotes: newDownvotes,
        net_score: Math.max(0, netScore),
        user_vote: user_vote
      }
    });

  } catch (error: any) {
    console.error('Error updating vote:', error);
    return res.status(500).json({ error: 'Failed to process vote' });
  }
};

// export const updateVote = async (
//   req: Request<{ targetId: string }, {}, { voteType: VoteType; targetType: VoteTargetType }>,
//   res: Response
// ): Promise<any> => {
//   const { targetId } = req.params;
//   const { voteType, targetType } = req.body;
//   const { id: user_id } = req.user!;

//   if (!user_id || !['upvote', 'downvote'].includes(voteType) || !['post', 'thread'].includes(targetType)) {
//     return res.status(400).json({ error: 'Invalid user, vote type, or target type.' });
//   }

//   const UPVOTE_WEIGHT = 20;
//   const DOWNVOTE_WEIGHT = 1;

//   try {
//     const { data: existingVote, error: fetchError } = await supabase
//       .from('post_votes')
//       .select('*')
//       .eq('user_id', user_id)
//       .eq('target_id', targetId)
//       .eq('target_type', targetType)
//       .single();

//     if (fetchError && fetchError.code !== 'PGRST116') {
//       return res.status(500).json({ error: fetchError.message });
//     }

//     const tableName = targetType === 'post' ? 'posts' : 'threads';
//     const { data: targetData, error: targetError } = await supabase
//       .from(tableName)
//       .select('total_upvotes, total_downvotes')
//       .eq('id', targetId)
//       .single();

//     if (targetError || !targetData) {
//       return res.status(404).json({ error: `${targetType} not found!` });
//     }

//     const currentUpvotes = Math.max(0, targetData.total_upvotes || 0);
//     const currentDownvotes = Math.max(0, targetData.total_downvotes || 0);
//     const currentNetScore = currentUpvotes - currentDownvotes;

//     let newUpvotes = currentUpvotes;
//     let newDownvotes = currentDownvotes;
//     let user_vote: 'upvote' | 'downvote' | null = voteType;

//     if (existingVote) {
//       if (existingVote.vote_type === voteType) {
//         // removing same vote
//         const { error: deleteError } = await supabase
//           .from('post_votes')
//           .delete()
//           .eq('id', existingVote.id);
//         if (deleteError) return res.status(500).json({ error: deleteError.message });

//         if (voteType === 'upvote') {
//           newUpvotes = Math.max(0, currentUpvotes - UPVOTE_WEIGHT);
//         } else {
//           newDownvotes = Math.max(0, currentDownvotes - DOWNVOTE_WEIGHT);
//         }

//         user_vote = null;
//       } else {
//         // switching votes
//         const { error: updateError } = await supabase
//           .from('post_votes')
//           .update({ vote_type: voteType, updated_at: new Date().toISOString() })
//           .eq('id', existingVote.id);
//         if (updateError) return res.status(500).json({ error: updateError.message });

//         if (existingVote.vote_type === 'upvote') {
//           newUpvotes = Math.max(0, currentUpvotes - UPVOTE_WEIGHT);
//           newDownvotes = Math.max(currentDownvotes, currentDownvotes + DOWNVOTE_WEIGHT);
//         } else {
//           newUpvotes = currentUpvotes + UPVOTE_WEIGHT;
//           newDownvotes = Math.max(0, currentDownvotes - DOWNVOTE_WEIGHT);
//         }
//       }
//     } else {
//       const { error: insertError } = await supabase
//         .from('post_votes')
//         .insert([{
//           user_id,
//           target_id: targetId,
//           target_type: targetType,
//           vote_type: voteType
//         }]);
//       if (insertError) return res.status(500).json({ error: insertError.message });

//       if (voteType === 'upvote') {
//         newUpvotes = currentUpvotes + UPVOTE_WEIGHT;
//       } else {
//         const potentialNetScore = currentUpvotes - (currentDownvotes + DOWNVOTE_WEIGHT);
//         if (potentialNetScore >= 0) {
//           newDownvotes = currentDownvotes + DOWNVOTE_WEIGHT;
//         } else {
//           newDownvotes = currentDownvotes;
//         }
//       }
//     }

//     newUpvotes = Math.max(0, newUpvotes);
//     newDownvotes = Math.max(0, newDownvotes);
    
//     const netScore = newUpvotes - newDownvotes;
//     if (netScore < 0) {
//       newDownvotes = newUpvotes;
//     }

//     const { error: updateTargetError } = await supabase
//       .from(tableName)
//       .update({
//         total_upvotes: newUpvotes,
//         total_downvotes: newDownvotes,
//         updated_at: new Date().toISOString()
//       })
//       .eq('id', targetId);
//     if (updateTargetError) return res.status(500).json({ error: updateTargetError.message });

//     return res.status(200).json({
//       message: `${voteType} ${existingVote ? (existingVote.vote_type === voteType ? 'removed' : 'updated') : 'added'}!`,
//       data: {
//         total_upvotes: newUpvotes,
//         total_downvotes: newDownvotes,
//         net_score: Math.max(0, netScore),
//         user_vote: user_vote
//       }
//     });

//   } catch (error: any) {
//     console.error('Error updating vote:', error);
//     return res.status(500).json({ error: 'Failed to process vote' });
//   }
// };
