import { Request, Response } from 'express';
import { supabase } from '../../app';
import { sendNotification } from '../../sockets/emitNotification';

type CommentReactionType = 'like' | 'dislike' | 'support' | 'valuable' | 'funny' | 'shocked' | 'moved' | 'triggered';

type VoteTargetType = 'post' | 'thread' | 'story' | 'comment' | 'subcomment';
type VoteType = 'upvote' | 'downvote';

type ContentType = 'post' | 'thread' | 'story' | 'comment' | 'subcomment';

interface SaveContentRequest {
  targetId: string;
  contentType: ContentType;
  postId?: string;
  threadId?: string;
  storyId?: string;
  commentId?: string;
  subcommentId?: string;
}

const commentFieldMap: Record<CommentReactionType, string> = {
  like: 'total_likes',
  dislike: 'total_dislikes',
  support: 'total_supports',
  valuable: 'total_valuables',
  funny: 'total_funnies',
  shocked: 'total_shockeds',
  moved: 'total_moveds',
  triggered: 'total_triggereds'
};

const commentSoulpointsMap: Record<CommentReactionType, number> = {
  like: 1,
  dislike: 0,
  support: 2,
  valuable: 3,
  funny: 1,
  shocked: 1,
  moved: 2,
  triggered: 1
};

function getTargetInfo(req: Request) {
  const { thread_id, post_id, story_id } = req.body;
  if (thread_id) return { targetType: 'thread', targetId: thread_id };
  if (post_id) return { targetType: 'post', targetId: post_id };
  if (story_id) return { targetType: 'story', targetId: story_id };
  return { targetType: null, targetId: null };
}

const createComment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { content, imgs = [] } = req.body;
    const { id: user_id, first_name, last_name, email } = req.user!;
    
    const { targetType, targetId } = getTargetInfo(req);

    if (!targetType || !targetId) {
      return res.status(400).json({ 
        error: 'Either thread_id, post_id, or story_id is required!' 
      });
    }

    if (!content || !user_id || !first_name) {
      return res.status(400).json({ error: 'Missing required fields!' });
    }

    let parentData, parentError, authorId, parentTitle;
    let isChamberPost = false;
    let chamberId = null;

    if (targetType === 'thread') {
      ({ data: parentData, error: parentError } = await supabase
        .from('threads')
        .select('id, author_id, title')
        .eq('id', targetId)
        .eq('is_deleted', false)
        .single());
      authorId = parentData?.author_id;
      parentTitle = parentData?.title;
    } else if (targetType === 'post') {
      ({ data: parentData, error: parentError } = await supabase
        .from('posts')
        .select('id, user_id, content, is_chamber_post, chamber_id')
        .eq('id', targetId)
        .eq('is_active', true)
        .single());
      authorId = parentData?.user_id;
      parentTitle = parentData?.content?.slice(0, 30) || 'a post';
      isChamberPost = parentData?.is_chamber_post || false;
      chamberId = parentData?.chamber_id || null;
    } else if (targetType === 'story') {
      ({ data: parentData, error: parentError } = await supabase
        .from('soul_stories')
        .select('id, author_id, title, description')
        .eq('id', targetId)
        .single());
      authorId = parentData?.author_id;
      parentTitle = parentData?.title || parentData?.description?.slice(0, 30) || 'a story';
    }

    if (parentError || !parentData) {
      return res.status(400).json({ error: `No ${targetType} found!` });
    }

    // Insert comment
    const user_name =
      (first_name && first_name.trim()) ? `${first_name}${last_name ? ` ${last_name}` : ''}` :
        (last_name && last_name.trim()) ? last_name :
          (email && email.trim()) ? email :
            'Anonymous';

    const insertObj: any = {
      content,
      imgs,
      user_name,
      user_id,
    };

    if (targetType === 'thread') insertObj.thread_id = targetId;
    else if (targetType === 'post') insertObj.post_id = targetId;
    else if (targetType === 'story') insertObj.story_id = targetId;

    const { data, error } = await supabase
      .from('threadcomments')
      .insert([insertObj])
      .select();

    if (error) {
      return res.status(500).json({ error: error.message || 'Unknown error occurred while creating comment.' });
    }
    if (!data || data.length === 0) {
      return res.status(500).json({ error: 'Comment creation failed. No data returned.' });
    }

    // Send notification and update soulpoints
    if (authorId && authorId !== user_id) {
      const { data: authorProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', authorId)
        .single();

      if (authorProfile) {
        let soulpoints = targetType === 'thread' ? 5 : targetType === 'story' ? 4 : 3;

        if (targetType === 'post' && isChamberPost && chamberId) {
          const { data: chamberData } = await supabase
            .from('custom_chambers')
            .select('monetization')
            .eq('id', chamberId)
            .single();

          if (chamberData && chamberData.monetization?.enabled) {
            soulpoints *= 2;
          }
        }

        const { error: soulpointsError } = await supabase.rpc('increment_soulpoints', {
          p_user_id: authorId,
          p_points: soulpoints
        });

        if (soulpointsError) {
          console.error('Error updating soulpoints:', soulpointsError);
        }

        const message = targetType === 'thread'
          ? `Comment posted on your thread "${parentTitle}"! +${soulpoints} soulpoints added to your profile`
          : targetType === 'story'
          ? `Comment posted on your story "${parentTitle}"! +${soulpoints} soulpoints added to your profile`
          : `Comment posted on your post! +${soulpoints} soulpoints added to your profile`;

        await sendNotification({
          recipientEmail: authorProfile.email,
          recipientUserId: authorId,
          actorUserId: user_id,
          threadId: targetId,
          message: message,
          type: targetType === 'thread' ? 'comment' : targetType === 'story' ? 'story_comment_added' : 'post_comment_added',
          metadata: {
            [`${targetType}_id`]: targetId,
            commenter_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
            soulpoints: soulpoints,
            is_chamber_post: isChamberPost,
            chamber_id: chamberId
          },
        });
      }
    }

    return res.status(201).json({ 
      message: 'Comment created successfully!',
      data: data[0] 
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'Internal server error while creating comment.',
      message: err.message || 'Unexpected failure.',
    });
  }
};

const deleteComment = async (
  req: Request<{ comment_id: string }> & { user?: { id: string; role?: string } },
  res: Response
): Promise<any> => {
  try {
    const { comment_id } = req.params;
    const { id: user_id, role } = req.user!;

    const { data: comment, error: fetchError } = await supabase
      .from('threadcomments')
      .select('id, user_id')
      .eq('id', comment_id)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !comment) {
      return res.status(404).json({ error: 'Comment not found!' });
    }

    const isAuthor = comment.user_id === user_id;
    const isSuperadmin = role === 'superadmin';

    if (!isAuthor && !isSuperadmin) {
      return res.status(403).json({ error: 'Permission denied!' });
    }

    const { error: deleteError } = await supabase
      .from('threadcomments')
      .update({
        is_deleted: true,
      })
      .eq('id', comment_id);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    return res.status(200).json({ message: 'Comment deleted successfully!' });

  } catch (err: any) {
    console.error('Unexpected error in deleteComment:', err);
    return res.status(500).json({
      error: 'Internal server error while deleting comment.',
      message: err.message || 'Unexpected failure.',
    });
  }
};

const updateComment = async (
  req: Request<{ comment_id: string }> & { user?: { id: string; role?: string; } },
  res: Response
): Promise<any> => {
  try {
    const { comment_id } = req.params;
    const { content, imgs } = req.body;
    const { id: user_id, role } = req.user!;

    const { data: existingComment, error: fetchError } = await supabase
      .from('threadcomments')
      .select('*')
      .eq('id', comment_id)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !existingComment) {
      return res.status(404).json({ error: 'Comment not found!' });
    }

    const isOwner = existingComment.user_id === user_id;
    const isSuperadmin = role === 'superadmin';

    if (!isOwner && !isSuperadmin) {
      return res.status(403).json({ error: 'Permission denied!' });
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Content is required and must be a non-empty string.' });
    }

    const { error: updateError } = await supabase
      .from('threadcomments')
      .update({
        content,
        imgs,
        is_edited: true
      })
      .eq('id', comment_id);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return res.status(500).json({
        error: updateError.message || 'Failed to update comment.',
        details: updateError.details || null,
        hint: updateError.hint || null,
      });
    }

    return res.status(200).json({ message: 'Comment updated successfully!' });

  } catch (err: any) {
    console.error('Unexpected error in updateComment:', err);
    return res.status(500).json({
      error: 'Internal server error while updating comment.',
      message: err.message || 'Unexpected failure.',
    });
  }
};

const getComments = async (req: Request, res: Response): Promise<any> => {
  try {
    const user_id = req.user?.id!;
    const { thread_id, post_id, story_id } = req.query;
    console.log(thread_id, post_id, story_id)
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    let filterKey: 'thread_id' | 'post_id' | 'story_id', filterValue: string;
    if (thread_id) {
      filterKey = 'thread_id';
      filterValue = thread_id as string;
    } else if (post_id) {
      filterKey = 'post_id';
      filterValue = post_id as string;
    } else if (story_id) {
      filterKey = 'story_id';
      filterValue = story_id as string;
    } else {
      return res.status(400).json({ error: 'thread_id, post_id, or story_id is required!' });
    }

    console.log(filterKey, filterValue)
    const { data: comments, error } = await supabase
      .from('threadcomments')
      .select(`*, profiles!inner(id, first_name, last_name, avatar_url, email)`)
      .eq(filterKey, filterValue)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      // .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: "Comment fetching failed!" });
    }

    console.log(comments)
    const commentIds = comments.map(comment => comment.id);

    // Fetch all votes for these comments
    const { data: allVotes } = await supabase
      .from('comment_votes')
      .select('target_id, vote_type')
      .in('target_id', commentIds)
      .eq('target_type', 'comment');

    // Fetch saved status for these comments
    const { data: savedComments } = await supabase
      .from('saved_content')
      .select('target_id')
      .in('target_id', commentIds)
      .eq('user_id', user_id)
      .eq('content_type', 'comment');

    const upvotesCountMap = new Map();
    const downvotesCountMap = new Map();
    const savedStatusMap = new Map();

    // Process votes
    allVotes?.forEach(vote => {
      if (vote.vote_type === 'upvote') {
        const count = upvotesCountMap.get(vote.target_id) || 0;
        upvotesCountMap.set(vote.target_id, count + 1);
      } else if (vote.vote_type === 'downvote') {
        const count = downvotesCountMap.get(vote.target_id) || 0;
        downvotesCountMap.set(vote.target_id, count + 1);
      }
    });

    // Process saved status
    savedComments?.forEach(saved => {
      savedStatusMap.set(saved.target_id, true);
    });

    const commentsWithReactions = await Promise.all(comments.map(async (comment) => {
      let userReaction = null;
      let userVote = null;

      if (user_id) {
        const [reactionResult, voteResult] = await Promise.all([
          supabase
            .from('thread_reactions')
            .select('type')
            .eq('user_id', user_id)
            .eq('target_type', 'comment')
            .eq('target_id', comment.id)
            .maybeSingle(),
          supabase
            .from('comment_votes')
            .select('vote_type')
            .eq('user_id', user_id)
            .eq('target_type', 'comment')
            .eq('target_id', comment.id)
            .maybeSingle()
        ]);

        if (reactionResult.data) userReaction = reactionResult.data.type;
        if (voteResult.data) userVote = voteResult.data.vote_type;
      }

      const totalUpvotes = upvotesCountMap.get(comment.id) || 0;
      const totalDownvotes = downvotesCountMap.get(comment.id) || 0;
      const netScore = Math.max(0, totalUpvotes - totalDownvotes);
      const user_saved = savedStatusMap.get(comment.id) || false;

      return { 
        ...comment, 
        user_reaction: userReaction,
        user_vote: userVote,
        net_score: netScore,
        user_saved: user_saved
      };
    }));

    return res.status(200).json({ comments: commentsWithReactions });
  }
  catch (err: any) {
    return res.status(500).json({
      error: err.message || 'Unexpected failure.',
    });
  }
};

const getCommentReactionDisplayName = (reactionType: CommentReactionType): string => {
  const displayNames = {
    like: 'like',
    dislike: 'dislike',
    support: 'support',
    valuable: 'valuable',
    funny: 'funny',
    shocked: 'shocked',
    moved: 'moved',
    triggered: 'triggered'
  };
  return displayNames[reactionType];
};

const updateCommentReaction = async (
  req: Request<{ comment_id: string }, {}, { type: CommentReactionType }>,
  res: Response
): Promise<any> => {
  const { comment_id } = req.params;
  const { type } = req.body;
  const { id: user_id } = req.user!;

  if (!user_id || !commentFieldMap[type]) {
    return res.status(400).json({ error: 'Invalid user or reaction type.' });
  }

  // Check if reaction already exists
  const { data: existing, error: fetchError } = await supabase
    .from('thread_reactions')
    .select('*')
    .eq('user_id', user_id)
    .eq('target_id', comment_id)
    .eq('target_type', 'comment')
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    return res.status(500).json({ error: fetchError.message });
  }

  const { data: commentData, error: commentError } = await supabase
    .from('threadcomments')
    .select(`
      total_likes, 
      total_dislikes,
      total_supports,
      total_valuables,
      total_funnies,
      total_shockeds,
      total_moveds,
      total_triggereds,
      user_id, 
      content,
      thread_id,
      post_id,
      story_id,
      is_deleted
    `)
    .eq('id', comment_id)
    .eq('is_deleted', false)
    .single();

  if (commentError || !commentData) {
    return res.status(404).json({ error: 'Comment not found!' });
  }

  // Determine parent context (thread, post, or story)
  let parentType: 'thread' | 'post' | 'story', parentId: string, parentTitle: string, parentAuthorId: string;

  if (commentData.thread_id) {
    parentType = 'thread';
    parentId = commentData.thread_id;
    const { data: threadData, error: threadError } = await supabase
      .from('threads')
      .select('title, author_id')
      .eq('id', parentId)
      .single();
    if (threadError || !threadData) {
      return res.status(404).json({ error: 'Thread not found!' });
    }
    parentTitle = threadData.title || 'a thread';
    parentAuthorId = threadData.author_id;
  } else if (commentData.post_id) {
    parentType = 'post';
    parentId = commentData.post_id;
    const { data: postData, error: postError } = await supabase
      .from('posts')
      .select('content, user_id')
      .eq('id', parentId)
      .single();
    if (postError || !postData) {
      return res.status(404).json({ error: 'Post not found!' });
    }
    parentTitle = postData.content?.slice(0, 30) || 'a post';
    parentAuthorId = postData.user_id;
  } else if (commentData.story_id) {
    parentType = 'story';
    parentId = commentData.story_id;
    const { data: storyData, error: storyError } = await supabase
      .from('soul_stories')
      .select('title, description, author_id')
      .eq('id', parentId)
      .single();
    if (storyError || !storyData) {
      return res.status(404).json({ error: 'Story not found!' });
    }
    parentTitle = storyData.title || storyData.description?.slice(0, 30) || 'a story';
    parentAuthorId = storyData.author_id;
  } else {
    return res.status(400).json({ error: 'Comment is not linked to a thread, post, or story.' });
  }

  const truncatedTitle = parentTitle.split(' ').length > 3
    ? parentTitle.split(' ').slice(0, 3).join(' ') + '...'
    : parentTitle;

  const shouldSendNotification = commentData.user_id !== user_id;

  let authorProfile = null;
  if (shouldSendNotification) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', commentData.user_id)
      .single();
    if (profileData) authorProfile = profileData;
  }

  // Initialize all reaction counts from the database
  const currentCounts = {
    total_likes: commentData.total_likes ?? 0,
    total_dislikes: commentData.total_dislikes ?? 0,
    total_supports: commentData.total_supports ?? 0,
    total_valuables: commentData.total_valuables ?? 0,
    total_funnies: commentData.total_funnies ?? 0,
    total_shockeds: commentData.total_shockeds ?? 0,
    total_moveds: commentData.total_moveds ?? 0,
    total_triggereds: commentData.total_triggereds ?? 0,
  };

  const getCommentPreview = (content: string): string => {
    const words = content.split(' ');
    return words.length > 5
      ? words.slice(0, 5).join(' ') + '...'
      : content;
  };

  // Handle existing reaction
  if (existing) {
    if (existing.type === type) {
      // Remove reaction - decrease count for this type
      const fieldToDecrease = commentFieldMap[type];
      const newCount = Math.max(0, currentCounts[fieldToDecrease as keyof typeof currentCounts] - 1);

      const { error: deleteError } = await supabase
        .from('thread_reactions')
        .delete()
        .eq('id', existing.id);

      if (deleteError) return res.status(500).json({ error: deleteError.message });

      const { error: updateCommentError } = await supabase
        .from('threadcomments')
        .update({ [fieldToDecrease]: newCount })
        .eq('id', comment_id);

      if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

      if (shouldSendNotification && authorProfile) {
        const notificationType = parentType === 'thread' ? 'reaction_removed' : 
                                parentType === 'story' ? 'story_comment_reaction_removed' : 
                                'post_comment_reaction_removed';
        
        await sendNotification({
          recipientEmail: authorProfile.email,
          recipientUserId: commentData.user_id,
          actorUserId: user_id,
          threadId: parentId,
          message: `_${getCommentReactionDisplayName(type)}_ reaction was removed from your comment: "${getCommentPreview(commentData.content)}" on ${parentType} **${truncatedTitle}**`,
          type: notificationType,
          metadata: {
            reaction_type: type,
            comment_id: comment_id,
            [`${parentType}_id`]: parentId,
            [`${parentType}_title`]: parentTitle,
            comment_content: commentData.content,
            actor_user_id: user_id
          }
        });
      }

      return res.status(200).json({
        message: `${type} removed!`,
        updatedCounts: {
          ...currentCounts,
          [fieldToDecrease]: newCount
        }
      });
    }

    // Change reaction type
    const prevField = commentFieldMap[existing.type as CommentReactionType];
    const currentField = commentFieldMap[type];

    const prevCount = Math.max(0, currentCounts[prevField as keyof typeof currentCounts] - 1);
    const currentCount = currentCounts[currentField as keyof typeof currentCounts] + 1;

    const { error: updateReactionError } = await supabase
      .from('thread_reactions')
      .update({ type, updated_by: user_id })
      .eq('id', existing.id);

    if (updateReactionError) return res.status(500).json({ error: updateReactionError.message });

    const { error: updateCommentError } = await supabase
      .from('threadcomments')
      .update({
        [prevField]: prevCount,
        [currentField]: currentCount,
      })
      .eq('id', comment_id);

    if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

    if (shouldSendNotification && authorProfile) {
      const notificationType = parentType === 'thread' ? 'reaction_updated' : 
                              parentType === 'story' ? 'story_comment_reaction_updated' : 
                              'post_comment_reaction_updated';
      
      await sendNotification({
        recipientEmail: authorProfile.email,
        recipientUserId: commentData.user_id,
        actorUserId: user_id,
        threadId: parentId,
        message: `**@someone** changed their reaction to _${getCommentReactionDisplayName(type)}_ on your comment: "${getCommentPreview(commentData.content)}" on ${parentType} **${truncatedTitle}**`,
        type: notificationType,
        metadata: {
          previous_reaction_type: existing.type,
          new_reaction_type: type,
          comment_id: comment_id,
          [`${parentType}_id`]: parentId,
          [`${parentType}_title`]: parentTitle,
          comment_content: commentData.content,
          actor_user_id: user_id
        }
      });
    }

    return res.status(200).json({
      message: `Reaction updated to ${type}!`,
      updatedCounts: {
        ...currentCounts,
        [prevField]: prevCount,
        [currentField]: currentCount
      }
    });
  } else {
    // Add new reaction
    const fieldToIncrease = commentFieldMap[type];
    const newCount = currentCounts[fieldToIncrease as keyof typeof currentCounts] + 1;

    const { error: insertError } = await supabase
      .from('thread_reactions')
      .insert([{
        user_id,
        target_id: comment_id,
        target_type: 'comment',
        type
      }]);

    if (insertError) return res.status(500).json({ error: insertError.message });

    const { error: updateCommentError } = await supabase
      .from('threadcomments')
      .update({ [fieldToIncrease]: newCount })
      .eq('id', comment_id);

    if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

    if (shouldSendNotification && authorProfile) {
      const soulpoints = commentSoulpointsMap[type] || 0;

      if (soulpoints > 0) {
        const { error: soulpointsError } = await supabase.rpc('increment_soulpoints', {
          p_user_id: commentData.user_id,
          p_points: soulpoints
        });

        if (soulpointsError) {
          console.error('Error updating SoulPoints:', soulpointsError);
        }
      }

      const notificationType = parentType === 'thread' ? 'reaction_added' : 
                              parentType === 'story' ? 'story_comment_reaction_added' : 
                              'post_comment_reaction_added';

      await sendNotification({
        recipientEmail: authorProfile.email,
        recipientUserId: commentData.user_id,
        actorUserId: user_id,
        threadId: parentId,
        message: `**@someone** reacted with _${getCommentReactionDisplayName(type)}_ on your comment: "${getCommentPreview(commentData.content)}" on ${parentType} **${truncatedTitle}** ${soulpoints > 0 ? `+${soulpoints} soulpoints added!` : ''}`,
        type: notificationType,
        metadata: {
          reaction_type: type,
          soulpoints: soulpoints,
          comment_id: comment_id,
          [`${parentType}_id`]: parentId,
          [`${parentType}_title`]: parentTitle,
          comment_content: commentData.content,
          actor_user_id: user_id
        }
      });
    }

    return res.status(200).json({
      message: `${type} added!`,
      updatedCounts: {
        ...currentCounts,
        [fieldToIncrease]: newCount
      }
    });
  }
};

const updateCommentsVote = async (
  req: Request<{ targetId: string }, {}, { voteType: VoteType; targetType: VoteTargetType }>,
  res: Response
): Promise<any> => {
  const { targetId } = req.params;
  const { voteType, targetType } = req.body;
  const { id: user_id, username } = req.user!;

  const validTargetTypes = ['post', 'thread', 'story', 'comment', 'subcomment'];
  const validVoteTypes = ['upvote', 'downvote'];

  if (!user_id || !validVoteTypes.includes(voteType) || !validTargetTypes.includes(targetType)) {
    return res.status(400).json({ error: 'Invalid user, vote type, or target type.' });
  }

  const tableConfig: Record<string, { table: string; upvoteField: string; downvoteField: string }> = {
    post: { table: 'posts', upvoteField: 'total_upvotes', downvoteField: 'total_downvotes' },
    thread: { table: 'threads', upvoteField: 'total_upvotes', downvoteField: 'total_downvotes' },
    story: { table: 'soul_stories', upvoteField: 'total_upvotes', downvoteField: 'total_downvotes' },
    comment: { table: 'threadcomments', upvoteField: 'total_upvotes', downvoteField: 'total_downvotes' },
    subcomment: { table: 'threadsubcomments', upvoteField: 'total_upvotes', downvoteField: 'total_downvotes' }
  };

  const config = tableConfig[targetType];
  if (!config) {
    return res.status(400).json({ error: 'Invalid target type.' });
  }

  
  const UPVOTE_WEIGHT = 1;
  const DOWNVOTE_WEIGHT = 1;

  try {
    const { data: existingVote, error: fetchError } = await supabase
      .from('comment_votes')
      .select('*')
      .eq('user_id', user_id)
      .eq('target_id', targetId)
      .eq('target_type', targetType)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return res.status(500).json({ error: fetchError.message });
    }

    const { data: targetData, error: targetError } = await supabase
      .from(config.table)
      .select('*')
      .eq('id', targetId)
      .single();

    if (targetError || !targetData) {
      return res.status(404).json({ error: `${targetType} not found!` });
    }

    if ((targetType === 'comment' || targetType === 'subcomment') && targetData.is_deleted) {
      return res.status(400).json({ error: 'Cannot vote on deleted content.' });
    }

    const currentUpvotes = Math.max(0, targetData[config.upvoteField] || 0);
    const currentDownvotes = Math.max(0, targetData[config.downvoteField] || 0);
    const currentNetScore = currentUpvotes - currentDownvotes;

    let newUpvotes = currentUpvotes;
    let newDownvotes = currentDownvotes;
    let user_vote: 'upvote' | 'downvote' | null = voteType;

    let shouldSendNotification = false;
    let authorProfile = null;
    let parentType: 'thread' | 'post' | 'story' | null = null;
    let parentId: string | null = null;
    let parentTitle = '';
    let contentPreview = '';

    if (targetType === 'comment' || targetType === 'subcomment') {
      const authorId = targetData.user_id;
      shouldSendNotification = authorId !== user_id;

      if (shouldSendNotification) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('id', authorId)
          .single();
        if (profileData) authorProfile = profileData;

        if (targetType === 'comment') {
          if (targetData.thread_id) {
            parentType = 'thread';
            parentId = targetData.thread_id;
            const { data: threadData } = await supabase
              .from('threads')
              .select('title, author_id')
              .eq('id', parentId)
              .single();
            parentTitle = threadData?.title || 'a thread';
          } else if (targetData.post_id) {
            parentType = 'post';
            parentId = targetData.post_id;
            const { data: postData } = await supabase
              .from('posts')
              .select('content, user_id')
              .eq('id', parentId)
              .single();
            parentTitle = postData?.content?.slice(0, 30) || 'a post';
          } else if (targetData.story_id) {
            parentType = 'story';
            parentId = targetData.story_id;
            const { data: storyData } = await supabase
              .from('soul_stories')
              .select('title, description, author_id')
              .eq('id', parentId)
              .single();
            parentTitle = storyData?.title || storyData?.description?.slice(0, 30) || 'a story';
          }
        } else if (targetType === 'subcomment' && targetData.comment_id) {
          const { data: parentComment } = await supabase
            .from('threadcomments')
            .select('thread_id, post_id, story_id')
            .eq('id', targetData.comment_id)
            .single();

          if (parentComment?.thread_id) {
            parentType = 'thread';
            parentId = parentComment.thread_id;
            const { data: threadData } = await supabase
              .from('threads')
              .select('title, author_id')
              .eq('id', parentId)
              .single();
            parentTitle = threadData?.title || 'a thread';
          } else if (parentComment?.post_id) {
            parentType = 'post';
            parentId = parentComment.post_id;
            const { data: postData } = await supabase
              .from('posts')
              .select('content, user_id')
              .eq('id', parentId)
              .single();
            parentTitle = postData?.content?.slice(0, 30) || 'a post';
          } else if (parentComment?.story_id) {
            parentType = 'story';
            parentId = parentComment.story_id;
            const { data: storyData } = await supabase
              .from('soul_stories')
              .select('title, content, user_id')
              .eq('id', parentId)
              .single();
            parentTitle = storyData?.title || storyData?.content?.slice(0, 30) || 'a story';
          }
        }

        const truncatedTitle = parentTitle.split(' ').length > 3
          ? parentTitle.split(' ').slice(0, 3).join(' ') + '...'
          : parentTitle;

        contentPreview = targetData.content?.split(' ').slice(0, 5).join(' ') + '...' || 'a comment';
      }
    }

    // VOTE LOGIC
    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        const { error: deleteError } = await supabase
          .from('comment_votes')
          .delete()
          .eq('id', existingVote.id);
        if (deleteError) return res.status(500).json({ error: deleteError.message });

        if (voteType === 'upvote') {
          newUpvotes = Math.max(0, currentUpvotes - UPVOTE_WEIGHT);
        } else {
          newDownvotes = Math.max(0, currentDownvotes - DOWNVOTE_WEIGHT);
        }

        user_vote = null;

        // Notification for vote removal
        if (shouldSendNotification && authorProfile && parentType) {
          const notificationType = parentType === 'thread' ? 'vote_removed' : 
                                  parentType === 'story' ? 'story_comment_vote_removed' : 
                                  'post_comment_vote_removed';
          
          await sendNotification({
            recipientEmail: authorProfile.email,
            recipientUserId: targetData.user_id,
            actorUserId: user_id,
            threadId: parentId,
            message: `_${voteType}_ was removed from your ${targetType}: "${contentPreview}" on ${parentType} **${parentTitle}**`,
            type: notificationType,
            metadata: {
              vote_type: voteType,
              target_type: targetType,
              target_id: targetId,
              [`${parentType}_id`]: parentId,
              [`${parentType}_title`]: parentTitle,
              content: targetData.content,
              actor_user_id: user_id
            }
          });
        }
      } else {
        // Switch vote
        const { error: updateError } = await supabase
          .from('comment_votes')
          .update({ vote_type: voteType, updated_at: new Date().toISOString() })
          .eq('id', existingVote.id);
        if (updateError) return res.status(500).json({ error: updateError.message });

        if (existingVote.vote_type === 'upvote') {
          newUpvotes = Math.max(0, currentUpvotes - UPVOTE_WEIGHT);
          const potentialNetScore = newUpvotes - (currentDownvotes + DOWNVOTE_WEIGHT);
          if (potentialNetScore >= 0) {
            newDownvotes = currentDownvotes + DOWNVOTE_WEIGHT;
          } else {
            newDownvotes = currentDownvotes;
          }
        } else {
          newUpvotes = currentUpvotes + UPVOTE_WEIGHT;
          newDownvotes = Math.max(0, currentDownvotes - DOWNVOTE_WEIGHT);
        }

        // Notification for vote change
        if (shouldSendNotification && authorProfile && parentType) {
          const notificationType = parentType === 'thread' ? 'vote_updated' : 
                                  parentType === 'story' ? 'story_comment_vote_updated' : 
                                  'post_comment_vote_updated';
          
          await sendNotification({
            recipientEmail: authorProfile.email,
            recipientUserId: targetData.user_id,
            actorUserId: user_id,
            threadId: parentId,
            message: `**@someone** changed their vote to _${voteType}_ on your ${targetType}: "${contentPreview}" on ${parentType} **${parentTitle}**`,
            type: notificationType,
            metadata: {
              previous_vote_type: existingVote.vote_type,
              new_vote_type: voteType,
              target_type: targetType,
              target_id: targetId,
              [`${parentType}_id`]: parentId,
              [`${parentType}_title`]: parentTitle,
              content: targetData.content,
              actor_user_id: user_id
            }
          });
        }
      }
    } else {
      // New vote
      const { error: insertError } = await supabase
        .from('comment_votes')
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

      // Notification for new vote
      if (shouldSendNotification && authorProfile && parentType) {
        const notificationType = parentType === 'thread' ? 'vote_added' : 
                                parentType === 'story' ? 'story_comment_vote_added' : 
                                'post_comment_vote_added';
        
        await sendNotification({
          recipientEmail: authorProfile.email,
          recipientUserId: targetData.user_id,
          actorUserId: user_id,
          threadId: parentId,
          message: `**@${username}** voted with _${voteType}_ on your ${targetType}: "${contentPreview}" on ${parentType} **${parentTitle}**`,
          type: notificationType,
          metadata: {
            vote_type: voteType,
            target_type: targetType,
            target_id: targetId,
            [`${parentType}_id`]: parentId,
            [`${parentType}_title`]: parentTitle,
            content: targetData.content,
            actor_user_id: user_id
          }
        });
      }
    }

    // Final protection
    newUpvotes = Math.max(0, newUpvotes);
    newDownvotes = Math.max(0, newDownvotes);

    const netScore = newUpvotes - newDownvotes;
    if (netScore < 0) {
      newDownvotes = newUpvotes;
    }

    // Update the target with new vote counts
    const { error: updateTargetError } = await supabase
      .from(config.table)
      .update({
        [config.upvoteField]: newUpvotes,
        [config.downvoteField]: newDownvotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetId);
    if (updateTargetError) return res.status(500).json({ error: updateTargetError.message });

    return res.status(200).json({
      success: true,
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
    return res.status(500).json({
      success: false,
      error: 'Failed to process vote'
    });
  }
};

const updateTotalSavedCounter = async (targetId: string, contentType: string, action: 'increment' | 'decrement') => {
  const tableConfig = {
    post: 'posts',
    thread: 'threads',
    story: 'soul_stories',
    comment: 'threadcomments',
    subcomment: 'threadsubcomments'
  };

  const table = tableConfig[contentType as keyof typeof tableConfig];
  
  if (!table) return;

  try {
    const { data: content, error } = await supabase
      .from(table)
      .select('total_saved')
      .eq('id', targetId)
      .single();

    if (error || !content) {
      console.error(`Error fetching ${contentType} data:`, error);
      return;
    }

    const currentSaved = content.total_saved || 0;
    const newSaved = action === 'increment' 
      ? currentSaved + 1 
      : Math.max(0, currentSaved - 1);

    const { error: updateError } = await supabase
      .from(table)
      .update({ total_saved: newSaved })
      .eq('id', targetId);

    if (updateError) {
      console.error(`Error updating ${contentType} total_saved:`, updateError);
    }

    console.log(`Updated ${contentType} ${targetId} total_saved: ${currentSaved} → ${newSaved}`);
  } catch (error) {
    console.error(`Error in updateTotalSavedCounter for ${contentType}:`, error);
  }
};

const updateSaveContent = async (
  req: Request<{ targetId: string }, {}, SaveContentRequest>,
  res: Response
): Promise<any> => {
  const { targetId } = req.params;
  const { contentType, threadId, postId, storyId, commentId, subcommentId } = req.body;
  const { id: user_id } = req.user!;

  try {
    const validContentTypes = ['post', 'thread', 'story', 'comment', 'subcomment'];
    if (!validContentTypes.includes(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    let finalPostId = postId || null;
    let finalThreadId = threadId || null;
    let finalStoryId = storyId || null;
    let finalCommentId = commentId || null;
    let finalSubcommentId = subcommentId || null;

    const tableConfig = {
      post: 'posts',
      thread: 'threads',
      story: 'soul_stories',
      comment: 'threadcomments',
      subcomment: 'threadsubcomments'
    };

    const table = tableConfig[contentType as keyof typeof tableConfig];
    const { data: content, error: contentError } = await supabase
      .from(table)
      .select('id')
      .eq('id', targetId)
      .single();

    if (contentError || !content) {
      return res.status(404).json({ error: `${contentType} not found` });
    }

    switch (contentType) {
      case 'post':
        finalPostId = targetId;
        break;
      case 'thread':
        finalThreadId = targetId;
        if (finalThreadId && !finalPostId) {
          const { data: thread, error: threadError } = await supabase
            .from('threads')
            .select('post_id')
            .eq('id', targetId)
            .single();
          
          if (!threadError && thread) {
            finalPostId = thread.post_id;
          }
        }
        break;
      case 'story':
        finalStoryId = targetId;
        break;
      case 'comment':
        finalCommentId = targetId;
        if (finalCommentId && (!finalThreadId || !finalPostId || !finalStoryId)) {
          const { data: comment, error: commentError } = await supabase
            .from('threadcomments')
            .select('thread_id, post_id, story_id')
            .eq('id', targetId)
            .single();
          
          if (!commentError && comment) {
            finalThreadId = finalThreadId || comment.thread_id;
            finalPostId = finalPostId || comment.post_id;
            finalStoryId = finalStoryId || comment.story_id;
          }
        }
        break;
      case 'subcomment':
        finalSubcommentId = targetId;
        if (finalSubcommentId && (!finalCommentId || !finalThreadId || !finalPostId || !finalStoryId)) {
          const { data: subcomment, error: subcommentError } = await supabase
            .from('threadsubcomments')
            .select('comment_id')
            .eq('id', targetId)
            .single();
          
          if (!subcommentError && subcomment) {
            finalCommentId = finalCommentId || subcomment.comment_id;
            
            if (finalCommentId) {
              const { data: comment, error: commentError } = await supabase
                .from('threadcomments')
                .select('thread_id, post_id, story_id')
                .eq('id', finalCommentId)
                .single();
              
              if (!commentError && comment) {
                finalThreadId = finalThreadId || comment.thread_id;
                finalPostId = finalPostId || comment.post_id;
                finalStoryId = finalStoryId || comment.story_id;
              }
            }
          }
        }
        break;
    }

    const { data: existingSave, error: fetchError } = await supabase
      .from('saved_content')
      .select('id')
      .eq('user_id', user_id)
      .eq('target_id', targetId)
      .eq('content_type', contentType)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    if (existingSave) {
      const { error: deleteError } = await supabase
        .from('saved_content')
        .delete()
        .eq('id', existingSave.id);

      if (deleteError) {
        return res.status(500).json({ error: deleteError.message });
      }

      await updateTotalSavedCounter(targetId, contentType, 'decrement');

      return res.json({
        success: true,
        action: 'removed',
        message: `${contentType} removed from saved`,
        saved: false
      });
    } else {
      const saveData: any = {
        user_id,
        content_type: contentType,
        target_id: targetId,
        post_id: finalPostId,
        thread_id: finalThreadId,
        story_id: finalStoryId,
        comment_id: finalCommentId,
        subcomment_id: finalSubcommentId
      };

      console.log('Inserting save data:', saveData);

      const { data: newSave, error: insertError } = await supabase
        .from('saved_content')
        .insert(saveData)
        .select()
        .single();

      if (insertError) {
        console.error('Insert error details:', insertError);
        return res.status(500).json({ error: insertError.message });
      }

      await updateTotalSavedCounter(targetId, contentType, 'increment');

      return res.json({
        success: true,
        action: 'added',
        message: `${contentType} saved successfully`,
        saved: true,
        data: newSave
      });
    }
  } catch (error: any) {
    console.error('Error in updateSaveContent:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getSavedContent = async (req: Request, res: Response): Promise<any> => {
  const { id: user_id } = req.user!;
  const { contentType, limit = '10', offset = '0' } = req.query;

  const validContentTypes = ['post', 'thread', 'story', 'comment', 'subcomment'];
  const contentFilter = contentType as string;
  
  if (contentFilter && !validContentTypes.includes(contentFilter)) {
    return res.status(400).json({ error: 'Invalid content type' });
  }

  try {
    let query = supabase
      .from('saved_content')
      .select(`
        *,
        posts:post_id(*, profiles:user_id(username, avatar_url, first_name, last_name)),
        threads:thread_id(*, profiles:user_id(username, avatar_url, first_name, last_name)),
        stories:story_id(*, profiles:user_id(username, avatar_url, first_name, last_name)),
        comments:comment_id(*, 
          profiles:user_id(username, avatar_url, first_name, last_name),
          threads:thread_id(id, title),
          posts:post_id(id, title),
          stories:story_id(id, title)
        ),
        subcomments:subcomment_id(*, 
          profiles:user_id(username, avatar_url, first_name, last_name),
          threadcomments:comment_id(id, content, thread_id, post_id, story_id)
        )
      `)
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

    if (contentFilter) {
      query = query.eq('content_type', contentFilter);
    }

    const { data: savedItems, error } = await query;

    if (error) {
      console.error('Error fetching saved content:', error);
      return res.status(500).json({ error: error.message });
    }

    const enrichedItems = await Promise.all(
      savedItems.map(async (item) => {
        let contentData: any = {};
        let authorProfile = null;
        let parentInfo = null;

        switch (item.content_type) {
          case 'post':
            contentData = item.posts;
            authorProfile = item.posts?.profiles;
            break;
          case 'thread':
            contentData = item.threads;
            authorProfile = item.threads?.profiles;
            break;
          case 'story':
            contentData = item.stories;
            authorProfile = item.stories?.profiles;
            break;
          case 'comment':
            contentData = item.comments;
            authorProfile = item.comments?.profiles;
            if (item.comments?.thread_id) {
              const { data: thread } = await supabase
                .from('threads')
                .select('title')
                .eq('id', item.comments.thread_id)
                .single();
              parentInfo = { type: 'thread', title: thread?.title, id: item.comments.thread_id };
            } else if (item.comments?.post_id) {
              const { data: post } = await supabase
                .from('posts')
                .select('title')
                .eq('id', item.comments.post_id)
                .single();
              parentInfo = { type: 'post', title: post?.title, id: item.comments.post_id };
            } else if (item.comments?.story_id) {
              const { data: story } = await supabase
                .from('soul_stories')
                .select('title')
                .eq('id', item.comments.story_id)
                .single();
              parentInfo = { type: 'story', title: story?.title, id: item.comments.story_id };
            }
            break;
          case 'subcomment':
            contentData = item.subcomments;
            authorProfile = item.subcomments?.profiles;
            if (item.subcomments?.comment_id) {
              const { data: parentComment } = await supabase
                .from('threadcomments')
                .select('content, thread_id, post_id, story_id')
                .eq('id', item.subcomments.comment_id)
                .single();
              
              if (parentComment?.thread_id) {
                const { data: thread } = await supabase
                  .from('threads')
                  .select('title')
                  .eq('id', parentComment.thread_id)
                  .single();
                parentInfo = { 
                  type: 'thread', 
                  title: thread?.title, 
                  id: parentComment.thread_id,
                  parentComment: parentComment.content
                };
              } else if (parentComment?.post_id) {
                const { data: post } = await supabase
                  .from('posts')
                  .select('title')
                  .eq('id', parentComment.post_id)
                  .single();
                parentInfo = { 
                  type: 'post', 
                  title: post?.title, 
                  id: parentComment.post_id,
                  parentComment: parentComment.content
                };
              } else if (parentComment?.story_id) {
                const { data: story } = await supabase
                  .from('soul_stories')
                  .select('title')
                  .eq('id', parentComment.story_id)
                  .single();
                parentInfo = { 
                  type: 'story', 
                  title: story?.title, 
                  id: parentComment.story_id,
                  parentComment: parentComment.content
                };
              }
            }
            break;
        }

        return {
          id: item.id,
          content_type: item.content_type,
          target_id: item.target_id,
          created_at: item.created_at,
          content: contentData,
          author: authorProfile,
          parent_info: parentInfo,
          post_id: item.post_id,
          thread_id: item.thread_id,
          story_id: item.story_id,
          comment_id: item.comment_id,
          subcomment_id: item.subcomment_id
        };
      })
    );

    return res.json({
      success: true,
      data: enrichedItems,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total: enrichedItems.length
      }
    });

  } catch (error: any) {
    console.error('Error in getSavedContent:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: error.message 
    });
  }
};

export {
  createComment,
  deleteComment,
  updateComment,
  getComments,
  updateCommentReaction,
  updateCommentsVote,
  updateSaveContent,
  getSavedContent,
}

// import { Request, Response } from 'express';
// import { supabase } from '../../app';
// import { sendNotification } from '../../sockets/emitNotification';

// type CommentReactionType = 'like' | 'dislike' | 'support' | 'valuable' | 'funny' | 'shocked' | 'moved' | 'triggered';

// type VoteTargetType = 'post' | 'thread' | 'comment' | 'subcomment';
// type VoteType = 'upvote' | 'downvote';

// type ContentType = 'post' | 'thread' | 'comment' | 'subcomment';

// interface SaveContentRequest {
//   targetId: string;
//   contentType: ContentType;
//   postId?: string;
//   threadId?: string;
//   commentId?: string;
//   subcommentId?: string;
// }

// const commentFieldMap: Record<CommentReactionType, string> = {
//   like: 'total_likes',
//   dislike: 'total_dislikes',
//   support: 'total_supports',
//   valuable: 'total_valuables',
//   funny: 'total_funnies',
//   shocked: 'total_shockeds',
//   moved: 'total_moveds',
//   triggered: 'total_triggereds'
// };

// const commentSoulpointsMap: Record<CommentReactionType, number> = {
//   like: 1,
//   dislike: 0,
//   support: 2,
//   valuable: 3,
//   funny: 1,
//   shocked: 1,
//   moved: 2,
//   triggered: 1
// };

// function getTargetInfo(req: Request) {
//   const { thread_id, post_id } = req.body;
//   if (thread_id) return { targetType: 'thread', targetId: thread_id };
//   if (post_id) return { targetType: 'post', targetId: post_id };
//   throw new Error('Either thread_id or post_id is required!');
// }

// // add new comment
// const createComment = async (req: Request, res: Response): Promise<any> => {
//   try {
//     const { content, imgs = [] } = req.body;
//     const { id: user_id, first_name, last_name, email } = req.user!;
//     const { targetType, targetId } = getTargetInfo(req);

//     if (!content || !user_id || !first_name) {
//       return res.status(400).json({ error: 'Missing required fields!' });
//     }

//     let parentData, parentError, authorId, parentTitle;
//     let isChamberPost = false;
//     let chamberId = null;

//     if (targetType === 'thread') {
//       ({ data: parentData, error: parentError } = await supabase
//         .from('threads')
//         .select('id, author_id, title')
//         .eq('id', targetId)
//         .eq('is_deleted', false)
//         .single());
//       authorId = parentData?.author_id;
//       parentTitle = parentData?.title;
//     } else {
//       ({ data: parentData, error: parentError } = await supabase
//         .from('posts')
//         .select('id, user_id, content, is_chamber_post, chamber_id')
//         .eq('id', targetId)
//         .eq('is_active', true)
//         .single());
//       authorId = parentData?.user_id;
//       parentTitle = parentData?.content?.slice(0, 30) || 'a post';
//       isChamberPost = parentData?.is_chamber_post || false;
//       chamberId = parentData?.chamber_id || null;
//     }

//     if (parentError || !parentData) {
//       return res.status(400).json({ error: `No ${targetType} found!` });
//     }

//     // Insert comment
//     const user_name =
//       (first_name && first_name.trim()) ? `${first_name}${last_name ? ` ${last_name}` : ''}` :
//         (last_name && last_name.trim()) ? last_name :
//           (email && email.trim()) ? email :
//             'Anonymous';

//     const insertObj: any = {
//       content,
//       imgs,
//       user_name,
//       user_id,
//     };

//     if (targetType === 'thread') insertObj.thread_id = targetId;
//     else insertObj.post_id = targetId;

//     const { data, error } = await supabase
//       .from('threadcomments')
//       .insert([insertObj])
//       .select();

//     if (authorId && authorId !== user_id) {
//       const { data: authorProfile } = await supabase
//         .from('profiles')
//         .select('email')
//         .eq('id', authorId)
//         .single();

//       if (authorProfile) {
//         let soulpoints = targetType === 'thread' ? 5 : 3;

//         if (targetType === 'post' && isChamberPost && chamberId) {
//           const { data: chamberData } = await supabase
//             .from('custom_chambers')
//             .select('monetization')
//             .eq('id', chamberId)
//             .single();

//           if (chamberData && chamberData.monetization?.enabled) {
//             soulpoints *= 2;
//           }
//         }

//         const { error: soulpointsError } = await supabase.rpc('increment_soulpoints', {
//           p_user_id: authorId,
//           p_points: soulpoints
//         });

//         if (soulpointsError) {
//           console.error('Error updating soulpoints:', soulpointsError);
//         }

//         const message = targetType === 'thread'
//           ? `Comment posted on your thread "${parentTitle}"! +${soulpoints} soulpoints added to your profile`
//           : `Comment posted on your post! +${soulpoints} soulpoints added to your profile`;

//         await sendNotification({
//           recipientEmail: authorProfile.email,
//           recipientUserId: authorId,
//           actorUserId: user_id,
//           threadId: targetId,
//           message: message,
//           type: targetType === 'thread' ? 'comment' : 'post_comment_added',
//           metadata: {
//             [`${targetType}_id`]: targetId,
//             commenter_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
//             soulpoints: soulpoints,
//             is_chamber_post: isChamberPost,
//             chamber_id: chamberId
//           },
//         });
//       }
//     }

//     if (error) {
//       return res.status(500).json({ error: error.message || 'Unknown error occurred while creating comment.' });
//     }
//     if (!data || data.length === 0) {
//       return res.status(500).json({ error: 'Comment creation failed. No data returned.' });
//     }

//     return res.status(201).json({ message: 'Comment created successfully!' });
//   } catch (err: any) {
//     return res.status(500).json({
//       error: 'Internal server error while creating comment.',
//       message: err.message || 'Unexpected failure.',
//     });
//   }
// };

// // delete comment
// const deleteComment = async (
//   req: Request<{ comment_id: string }> & { user?: { id: string; role?: string } },
//   res: Response
// ): Promise<any> => {
//   try {
//     const { comment_id } = req.params;
//     const { id: user_id, role } = req.user!;

//     const { data: comment, error: fetchError } = await supabase
//       .from('threadcomments')
//       .select('id, user_id')
//       .eq('id', comment_id)
//       .eq('is_deleted', false)
//       .single();

//     if (fetchError || !comment) {
//       return res.status(404).json({ error: 'Comment not found!' });
//     }

//     const isAuthor = comment.user_id === user_id;
//     const isSuperadmin = role === 'superadmin';

//     if (!isAuthor && !isSuperadmin) {
//       return res.status(403).json({ error: 'Permission denied!' });
//     }

//     const { error: deleteError } = await supabase
//       .from('threadcomments')
//       .update({
//         is_deleted: true,
//       })
//       .eq('id', comment_id);

//     if (deleteError) {
//       return res.status(500).json({ error: deleteError.message });
//     }

//     return res.status(200).json({ message: 'Comment deleted successfully!' });

//   } catch (err: any) {
//     console.error('Unexpected error in deleteComment:', err);
//     return res.status(500).json({
//       error: 'Internal server error while deleting comment.',
//       message: err.message || 'Unexpected failure.',
//     });
//   }
// };

// // update comment
// const updateComment = async (
//   req: Request<{ comment_id: string }> & { user?: { id: string; role?: string; } },
//   res: Response
// ): Promise<any> => {
//   try {
//     const { comment_id } = req.params;
//     const { content, imgs } = req.body;
//     const { id: user_id, role } = req.user!;

//     const { data: existingComment, error: fetchError } = await supabase
//       .from('threadcomments')
//       .select('*')
//       .eq('id', comment_id)
//       .eq('is_deleted', false)
//       .single();

//     if (fetchError || !existingComment) {
//       return res.status(404).json({ error: 'Comment not found!' });
//     }

//     const isOwner = existingComment.user_id === user_id;
//     const isSuperadmin = role === 'superadmin';

//     if (!isOwner && !isSuperadmin) {
//       return res.status(403).json({ error: 'Permission denied!' });
//     }

//     if (!content || typeof content !== 'string' || !content.trim()) {
//       return res.status(400).json({ error: 'Content is required and must be a non-empty string.' });
//     }

//     const { error: updateError } = await supabase
//       .from('threadcomments')
//       .update({
//         content,
//         imgs,
//         is_edited: true
//       })
//       .eq('id', comment_id);

//     if (updateError) {
//       console.error('Supabase update error:', updateError);
//       return res.status(500).json({
//         error: updateError.message || 'Failed to update comment.',
//         details: updateError.details || null,
//         hint: updateError.hint || null,
//       });
//     }

//     return res.status(200).json({ message: 'Comment updated successfully!' });

//   } catch (err: any) {
//     console.error('Unexpected error in updateComment:', err);
//     return res.status(500).json({
//       error: 'Internal server error while updating comment.',
//       message: err.message || 'Unexpected failure.',
//     });
//   }
// };

// // get all comment by thread_id
// const getComments = async (
//   req: Request,
//   res: Response
// ): Promise<any> => {
//   try {
//     const user_id = req.user?.id!;
//     const { thread_id, post_id } = req.query;
//     console.log(thread_id, post_id)
//     const limit = parseInt(req.query.limit as string) || 10;
//     const offset = parseInt(req.query.offset as string) || 0;

//     let filterKey: 'thread_id' | 'post_id', filterValue: string;
//     if (thread_id) {
//       filterKey = 'thread_id';
//       filterValue = thread_id as string;
//     } else if (post_id) {
//       filterKey = 'post_id';
//       filterValue = post_id as string;
//     } else {
//       return res.status(400).json({ error: 'thread_id or post_id is required!' });
//     }

//     const { data: comments, error } = await supabase
//       .from('threadcomments')
//       .select(`*, profiles!inner(id, first_name, last_name, avatar_url, email)`)
//       .eq(filterKey, filterValue)
//       .eq('is_deleted', false)
//       .order('created_at', { ascending: false })
//       .range(offset, offset + limit - 1);

//     if (error) {
//       return res.status(500).json({ error: "Comment fetching failed!" });
//     }

//     const commentIds = comments.map(comment => comment.id);

//     // Fetch all votes for these comments
//     const { data: allVotes } = await supabase
//       .from('comment_votes')
//       .select('target_id, vote_type')
//       .in('target_id', commentIds)
//       .eq('target_type', 'comment');

//     // Fetch saved status for these comments
//     const { data: savedComments } = await supabase
//       .from('saved_content')
//       .select('target_id')
//       .in('target_id', commentIds)
//       .eq('user_id', user_id)
//       .eq('content_type', 'comment');

//     const upvotesCountMap = new Map();
//     const downvotesCountMap = new Map();
//     const savedStatusMap = new Map();

//     // Process votes
//     allVotes?.forEach(vote => {
//       if (vote.vote_type === 'upvote') {
//         const count = upvotesCountMap.get(vote.target_id) || 0;
//         upvotesCountMap.set(vote.target_id, count + 1);
//       } else if (vote.vote_type === 'downvote') {
//         const count = downvotesCountMap.get(vote.target_id) || 0;
//         downvotesCountMap.set(vote.target_id, count + 1);
//       }
//     });

//     // Process saved status
//     savedComments?.forEach(saved => {
//       savedStatusMap.set(saved.target_id, true);
//     });

//     const commentsWithReactions = await Promise.all(comments.map(async (comment) => {
//       let userReaction = null;
//       let userVote = null;

//       if (user_id) {
//         const [reactionResult, voteResult] = await Promise.all([
//           supabase
//             .from('thread_reactions')
//             .select('type')
//             .eq('user_id', user_id)
//             .eq('target_type', 'comment')
//             .eq('target_id', comment.id)
//             .maybeSingle(),
//           supabase
//             .from('comment_votes')
//             .select('vote_type')
//             .eq('user_id', user_id)
//             .eq('target_type', 'comment')
//             .eq('target_id', comment.id)
//             .maybeSingle()
//         ]);

//         if (reactionResult.data) userReaction = reactionResult.data.type;
//         if (voteResult.data) userVote = voteResult.data.vote_type;
//       }

//       const totalUpvotes = upvotesCountMap.get(comment.id) || 0;
//       const totalDownvotes = downvotesCountMap.get(comment.id) || 0;
//       const netScore = Math.max(0, totalUpvotes - totalDownvotes);
//       const user_saved = savedStatusMap.get(comment.id) || false;

//       return { 
//         ...comment, 
//         user_reaction: userReaction,
//         user_vote: userVote,
//         net_score: netScore,
//         user_saved: user_saved
//       };
//     }));

//     return res.status(200).json({ comments: commentsWithReactions });
//   }
//   catch (err: any) {
//     return res.status(500).json({
//       error: err.message || 'Unexpected failure.',
//     });
//   }
// };

// // Get reaction display name
// const getCommentReactionDisplayName = (reactionType: CommentReactionType): string => {
//   const displayNames = {
//     like: 'like',
//     dislike: 'dislike',
//     support: 'support',
//     valuable: 'valuable',
//     funny: 'funny',
//     shocked: 'shocked',
//     moved: 'moved',
//     triggered: 'triggered'
//   };
//   return displayNames[reactionType];
// };

// // Main comment reaction API
// const updateCommentReaction = async (
//   req: Request<{ comment_id: string }, {}, { type: CommentReactionType }>,
//   res: Response
// ): Promise<any> => {
//   const { comment_id } = req.params;
//   const { type } = req.body;
//   const { id: user_id } = req.user!;

//   // Define the proper field mapping
//   const commentFieldMap: Record<CommentReactionType, string> = {
//     like: 'total_likes',
//     dislike: 'total_dislikes',
//     support: 'total_supports',
//     valuable: 'total_valuables',
//     funny: 'total_funnies',
//     shocked: 'total_shockeds',
//     moved: 'total_moveds',
//     triggered: 'total_triggereds',
//   };

//   if (!user_id || !commentFieldMap[type]) {
//     return res.status(400).json({ error: 'Invalid user or reaction type.' });
//   }

//   // Check if reaction already exists
//   const { data: existing, error: fetchError } = await supabase
//     .from('thread_reactions')
//     .select('*')
//     .eq('user_id', user_id)
//     .eq('target_id', comment_id)
//     .eq('target_type', 'comment')
//     .single();

//   if (fetchError && fetchError.code !== 'PGRST116') {
//     return res.status(500).json({ error: fetchError.message });
//   }

//   // Fetch comment with all reaction counts
//   const { data: commentData, error: commentError } = await supabase
//     .from('threadcomments')
//     .select(`
//       total_likes, 
//       total_dislikes,
//       total_supports,
//       total_valuables,
//       total_funnies,
//       total_shockeds,
//       total_moveds,
//       total_triggereds,
//       user_id, 
//       content,
//       thread_id,
//       post_id,
//       is_deleted
//     `)
//     .eq('id', comment_id)
//     .eq('is_deleted', false)
//     .single();

//   if (commentError || !commentData) {
//     return res.status(404).json({ error: 'Comment not found!' });
//   }

//   // Determine parent context (thread or post)
//   let parentType: 'thread' | 'post', parentId: string, parentTitle: string, parentAuthorId: string;

//   if (commentData.thread_id) {
//     parentType = 'thread';
//     parentId = commentData.thread_id;
//     const { data: threadData, error: threadError } = await supabase
//       .from('threads')
//       .select('title, author_id')
//       .eq('id', parentId)
//       .single();
//     if (threadError || !threadData) {
//       return res.status(404).json({ error: 'Thread not found!' });
//     }
//     parentTitle = threadData.title || 'a thread';
//     parentAuthorId = threadData.author_id;
//   } else if (commentData.post_id) {
//     parentType = 'post';
//     parentId = commentData.post_id;
//     const { data: postData, error: postError } = await supabase
//       .from('posts')
//       .select('content, user_id')
//       .eq('id', parentId)
//       .single();
//     if (postError || !postData) {
//       return res.status(404).json({ error: 'Post not found!' });
//     }
//     parentTitle = postData.content?.slice(0, 30) || 'a post';
//     parentAuthorId = postData.user_id;
//   } else {
//     return res.status(400).json({ error: 'Comment is not linked to a thread or post.' });
//   }

//   const truncatedTitle = parentTitle.split(' ').length > 3
//     ? parentTitle.split(' ').slice(0, 3).join(' ') + '...'
//     : parentTitle;

//   const shouldSendNotification = commentData.user_id !== user_id;

//   let authorProfile = null;
//   if (shouldSendNotification) {
//     const { data: profileData } = await supabase
//       .from('profiles')
//       .select('email, first_name, last_name')
//       .eq('id', commentData.user_id)
//       .single();
//     if (profileData) authorProfile = profileData;
//   }

//   // Initialize all reaction counts from the database
//   const currentCounts = {
//     total_likes: commentData.total_likes ?? 0,
//     total_dislikes: commentData.total_dislikes ?? 0,
//     total_supports: commentData.total_supports ?? 0,
//     total_valuables: commentData.total_valuables ?? 0,
//     total_funnies: commentData.total_funnies ?? 0,
//     total_shockeds: commentData.total_shockeds ?? 0,
//     total_moveds: commentData.total_moveds ?? 0,
//     total_triggereds: commentData.total_triggereds ?? 0,
//   };

//   const getCommentPreview = (content: string): string => {
//     const words = content.split(' ');
//     return words.length > 5
//       ? words.slice(0, 5).join(' ') + '...'
//       : content;
//   };

//   // Handle existing reaction
//   if (existing) {
//     if (existing.type === type) {
//       // Remove reaction - decrease count for this type
//       const fieldToDecrease = commentFieldMap[type];
//       const newCount = Math.max(0, currentCounts[fieldToDecrease as keyof typeof currentCounts] - 1);

//       const { error: deleteError } = await supabase
//         .from('thread_reactions')
//         .delete()
//         .eq('id', existing.id);

//       if (deleteError) return res.status(500).json({ error: deleteError.message });

//       // Update only the specific field that changed
//       const { error: updateCommentError } = await supabase
//         .from('threadcomments')
//         .update({ [fieldToDecrease]: newCount })
//         .eq('id', comment_id);

//       if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

//       if (shouldSendNotification && authorProfile) {
//         await sendNotification({
//           recipientEmail: authorProfile.email,
//           recipientUserId: commentData.user_id,
//           actorUserId: user_id,
//           threadId: parentId,
//           message: `_${getCommentReactionDisplayName(type)}_ reaction was removed from your comment: "${getCommentPreview(commentData.content)}" on ${parentType} **${truncatedTitle}**`,
//           type: parentType === 'thread' ? 'reaction_removed' : 'post_comment_reaction_removed',
//           metadata: {
//             reaction_type: type,
//             comment_id: comment_id,
//             [`${parentType}_id`]: parentId,
//             [`${parentType}_title`]: parentTitle,
//             comment_content: commentData.content,
//             actor_user_id: user_id
//           }
//         });
//       }

//       return res.status(200).json({
//         message: `${type} removed!`,
//         updatedCounts: {
//           ...currentCounts,
//           [fieldToDecrease]: newCount
//         }
//       });
//     }

//     // Change reaction type - decrease old type, increase new type
//     const prevField = commentFieldMap[existing.type as CommentReactionType];
//     const currentField = commentFieldMap[type];

//     const prevCount = Math.max(0, currentCounts[prevField as keyof typeof currentCounts] - 1);
//     const currentCount = currentCounts[currentField as keyof typeof currentCounts] + 1;

//     const { error: updateReactionError } = await supabase
//       .from('thread_reactions')
//       .update({ type, updated_by: user_id })
//       .eq('id', existing.id);

//     if (updateReactionError) return res.status(500).json({ error: updateReactionError.message });

//     // Update both fields that changed
//     const { error: updateCommentError } = await supabase
//       .from('threadcomments')
//       .update({
//         [prevField]: prevCount,
//         [currentField]: currentCount,
//       })
//       .eq('id', comment_id);

//     if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

//     if (shouldSendNotification && authorProfile) {
//       await sendNotification({
//         recipientEmail: authorProfile.email,
//         recipientUserId: commentData.user_id,
//         actorUserId: user_id,
//         threadId: parentId,
//         message: `**@someone** changed their reaction to _${getCommentReactionDisplayName(type)}_ on your comment: "${getCommentPreview(commentData.content)}" on ${parentType} **${truncatedTitle}**`,
//         type: parentType === 'thread' ? 'reaction_updated' : 'post_comment_reaction_updated',
//         metadata: {
//           previous_reaction_type: existing.type,
//           new_reaction_type: type,
//           comment_id: comment_id,
//           [`${parentType}_id`]: parentId,
//           [`${parentType}_title`]: parentTitle,
//           comment_content: commentData.content,
//           actor_user_id: user_id
//         }
//       });
//     }

//     return res.status(200).json({
//       message: `Reaction updated to ${type}!`,
//       updatedCounts: {
//         ...currentCounts,
//         [prevField]: prevCount,
//         [currentField]: currentCount
//       }
//     });
//   } else {
//     // Add new reaction - increase count for this type
//     const fieldToIncrease = commentFieldMap[type];
//     const newCount = currentCounts[fieldToIncrease as keyof typeof currentCounts] + 1;

//     const { error: insertError } = await supabase
//       .from('thread_reactions')
//       .insert([{
//         user_id,
//         target_id: comment_id,
//         target_type: 'comment',
//         type
//       }]);

//     if (insertError) return res.status(500).json({ error: insertError.message });

//     // Update only the specific field that changed
//     const { error: updateCommentError } = await supabase
//       .from('threadcomments')
//       .update({ [fieldToIncrease]: newCount })
//       .eq('id', comment_id);

//     if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

//     if (shouldSendNotification && authorProfile) {
//       const soulpoints = commentSoulpointsMap[type] || 0;

//       if (soulpoints > 0) {
//         const { error: soulpointsError } = await supabase.rpc('increment_soulpoints', {
//           p_user_id: commentData.user_id,
//           p_points: soulpoints
//         });

//         if (soulpointsError) {
//           console.error('Error updating SoulPoints:', soulpointsError);
//         }
//       }

//       await sendNotification({
//         recipientEmail: authorProfile.email,
//         recipientUserId: commentData.user_id,
//         actorUserId: user_id,
//         threadId: parentId,
//         message: `**@someone** reacted with _${getCommentReactionDisplayName(type)}_ on your comment: "${getCommentPreview(commentData.content)}" on ${parentType} **${truncatedTitle}** ${soulpoints > 0 ? `+${soulpoints} soulpoints added!` : ''}`,
//         type: parentType === 'thread' ? 'reaction_added' : 'post_comment_reaction_added',
//         metadata: {
//           reaction_type: type,
//           soulpoints: soulpoints,
//           comment_id: comment_id,
//           [`${parentType}_id`]: parentId,
//           [`${parentType}_title`]: parentTitle,
//           comment_content: commentData.content,
//           actor_user_id: user_id
//         }
//       });
//     }

//     return res.status(200).json({
//       message: `${type} added!`,
//       updatedCounts: {
//         ...currentCounts,
//         [fieldToIncrease]: newCount
//       }
//     });
//   }
// };

// const updateCommentsVote = async (
//   req: Request<{ targetId: string }, {}, { voteType: VoteType; targetType: VoteTargetType }>,
//   res: Response
// ): Promise<any> => {
//   const { targetId } = req.params;
//   const { voteType, targetType } = req.body;
//   const { id: user_id } = req.user!;

//   const validTargetTypes = ['post', 'thread', 'comment', 'subcomment'];
//   const validVoteTypes = ['upvote', 'downvote'];

//   if (!user_id || !validVoteTypes.includes(voteType) || !validTargetTypes.includes(targetType)) {
//     return res.status(400).json({ error: 'Invalid user, vote type, or target type.' });
//   }

//   const tableConfig: Record<string, { table: string; upvoteField: string; downvoteField: string }> = {
//     post: { table: 'posts', upvoteField: 'total_upvotes', downvoteField: 'total_downvotes' },
//     thread: { table: 'threads', upvoteField: 'total_upvotes', downvoteField: 'total_downvotes' },
//     comment: { table: 'threadcomments', upvoteField: 'total_upvotes', downvoteField: 'total_downvotes' },
//     subcomment: { table: 'threadsubcomments', upvoteField: 'total_upvotes', downvoteField: 'total_downvotes' }
//   };

//   const config = tableConfig[targetType];
//   if (!config) {
//     return res.status(400).json({ error: 'Invalid target type.' });
//   }

  
//   const UPVOTE_WEIGHT = 20;
//   const DOWNVOTE_WEIGHT = 1;

//   try {
//     const { data: existingVote, error: fetchError } = await supabase
//       .from('comment_votes')
//       .select('*')
//       .eq('user_id', user_id)
//       .eq('target_id', targetId)
//       .eq('target_type', targetType)
//       .single();

//     if (fetchError && fetchError.code !== 'PGRST116') {
//       return res.status(500).json({ error: fetchError.message });
//     }

//     const { data: targetData, error: targetError } = await supabase
//       .from(config.table)
//       .select('*')
//       .eq('id', targetId)
//       .single();

//     if (targetError || !targetData) {
//       return res.status(404).json({ error: `${targetType} not found!` });
//     }

//     if ((targetType === 'comment' || targetType === 'subcomment') && targetData.is_deleted) {
//       return res.status(400).json({ error: 'Cannot vote on deleted content.' });
//     }

//     const currentUpvotes = Math.max(0, targetData[config.upvoteField] || 0);
//     const currentDownvotes = Math.max(0, targetData[config.downvoteField] || 0);
//     const currentNetScore = currentUpvotes - currentDownvotes;

//     let newUpvotes = currentUpvotes;
//     let newDownvotes = currentDownvotes;
//     let user_vote: 'upvote' | 'downvote' | null = voteType;

//     let shouldSendNotification = false;
//     let authorProfile = null;
//     let parentType: 'thread' | 'post' | null = null;
//     let parentId: string | null = null;
//     let parentTitle = '';
//     let contentPreview = '';

//     if (targetType === 'comment' || targetType === 'subcomment') {
//       const authorId = targetData.user_id;
//       shouldSendNotification = authorId !== user_id;

//       if (shouldSendNotification) {
//         const { data: profileData } = await supabase
//           .from('profiles')
//           .select('email, first_name, last_name')
//           .eq('id', authorId)
//           .single();
//         if (profileData) authorProfile = profileData;

//         if (targetType === 'comment' && targetData.thread_id) {
//           parentType = 'thread';
//           parentId = targetData.thread_id;
//           const { data: threadData } = await supabase
//             .from('threads')
//             .select('title, author_id')
//             .eq('id', parentId)
//             .single();
//           parentTitle = threadData?.title || 'a thread';
//         }
//         else if (targetType === 'subcomment' && targetData.comment_id) {
//           const { data: parentComment } = await supabase
//             .from('threadcomments')
//             .select('thread_id')
//             .eq('id', targetData.comment_id)
//             .single();

//           if (parentComment?.thread_id) {
//             parentType = 'thread';
//             parentId = parentComment.thread_id;
//             const { data: threadData } = await supabase
//               .from('threads')
//               .select('title, author_id')
//               .eq('id', parentId)
//               .single();
//             parentTitle = threadData?.title || 'a thread';
//           }
//         }

//         const truncatedTitle = parentTitle.split(' ').length > 3
//           ? parentTitle.split(' ').slice(0, 3).join(' ') + '...'
//           : parentTitle;

//         contentPreview = targetData.content?.split(' ').slice(0, 5).join(' ') + '...' || 'a comment';
//       }
//     }

//     // VOTE LOGIC
//     if (existingVote) {
//       if (existingVote.vote_type === voteType) {
//         const { error: deleteError } = await supabase
//           .from('comment_votes')
//           .delete()
//           .eq('id', existingVote.id);
//         if (deleteError) return res.status(500).json({ error: deleteError.message });

//         if (voteType === 'upvote') {
//           newUpvotes = Math.max(0, currentUpvotes - UPVOTE_WEIGHT);
//         } else {
//           newDownvotes = Math.max(0, currentDownvotes - DOWNVOTE_WEIGHT);
//         }

//         user_vote = null;

//         // Notification for vote removal
//         if (shouldSendNotification && authorProfile && parentType) {
//           await sendNotification({
//             recipientEmail: authorProfile.email,
//             recipientUserId: targetData.user_id,
//             actorUserId: user_id,
//             threadId: parentId,
//             message: `_${voteType}_ was removed from your ${targetType}: "${contentPreview}" on ${parentType} **${parentTitle}**`,
//             type: parentType === 'thread' ? 'vote_removed' : 'post_comment_vote_removed',
//             metadata: {
//               vote_type: voteType,
//               target_type: targetType,
//               target_id: targetId,
//               [`${parentType}_id`]: parentId,
//               [`${parentType}_title`]: parentTitle,
//               content: targetData.content,
//               actor_user_id: user_id
//             }
//           });
//         }
//       } else {
//         // Switch vote - user changed from upvote to downvote or vice versa
//         const { error: updateError } = await supabase
//           .from('comment_votes')
//           .update({ vote_type: voteType, updated_at: new Date().toISOString() })
//           .eq('id', existingVote.id);
//         if (updateError) return res.status(500).json({ error: updateError.message });

//         if (existingVote.vote_type === 'upvote') {
//           // from upvote → downvote
//           newUpvotes = Math.max(0, currentUpvotes - UPVOTE_WEIGHT);
//           // Only allow downvote increment if it won't make net score negative
//           const potentialNetScore = newUpvotes - (currentDownvotes + DOWNVOTE_WEIGHT);
//           if (potentialNetScore >= 0) {
//             newDownvotes = currentDownvotes + DOWNVOTE_WEIGHT;
//           } else {
//             newDownvotes = currentDownvotes;
//           }
//         } else {
//           // from downvote → upvote
//           newUpvotes = currentUpvotes + UPVOTE_WEIGHT;
//           newDownvotes = Math.max(0, currentDownvotes - DOWNVOTE_WEIGHT);
//         }

//         // Notification for vote change
//         if (shouldSendNotification && authorProfile && parentType) {
//           await sendNotification({
//             recipientEmail: authorProfile.email,
//             recipientUserId: targetData.user_id,
//             actorUserId: user_id,
//             threadId: parentId,
//             message: `**@someone** changed their vote to _${voteType}_ on your ${targetType}: "${contentPreview}" on ${parentType} **${parentTitle}**`,
//             type: parentType === 'thread' ? 'vote_updated' : 'post_comment_vote_updated',
//             metadata: {
//               previous_vote_type: existingVote.vote_type,
//               new_vote_type: voteType,
//               target_type: targetType,
//               target_id: targetId,
//               [`${parentType}_id`]: parentId,
//               [`${parentType}_title`]: parentTitle,
//               content: targetData.content,
//               actor_user_id: user_id
//             }
//           });
//         }
//       }
//     } else {
//       // New vote - user is voting for the first time
//       const { error: insertError } = await supabase
//         .from('comment_votes')
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
//         // For downvote: only increment if it won't make net score negative
//         const potentialNetScore = currentUpvotes - (currentDownvotes + DOWNVOTE_WEIGHT);
//         if (potentialNetScore >= 0) {
//           newDownvotes = currentDownvotes + DOWNVOTE_WEIGHT;
//         } else {
//           // If downvote would make net score negative, don't increment downvotes
//           newDownvotes = currentDownvotes;
//         }
//       }

//       // Notification for new vote
//       if (shouldSendNotification && authorProfile && parentType) {
//         await sendNotification({
//           recipientEmail: authorProfile.email,
//           recipientUserId: targetData.user_id,
//           actorUserId: user_id,
//           threadId: parentId,
//           message: `**@someone** voted with _${voteType}_ on your ${targetType}: "${contentPreview}" on ${parentType} **${parentTitle}**`,
//           type: parentType === 'thread' ? 'vote_added' : 'post_comment_vote_added',
//           metadata: {
//             vote_type: voteType,
//             target_type: targetType,
//             target_id: targetId,
//             [`${parentType}_id`]: parentId,
//             [`${parentType}_title`]: parentTitle,
//             content: targetData.content,
//             actor_user_id: user_id
//           }
//         });
//       }
//     }

//     // Final protection: ensure values never go below zero and net score is never negative
//     newUpvotes = Math.max(0, newUpvotes);
//     newDownvotes = Math.max(0, newDownvotes);

//     const netScore = newUpvotes - newDownvotes;
//     if (netScore < 0) {
//       // Adjust downvotes to prevent negative net score
//       newDownvotes = newUpvotes;
//     }

//     // Update the target with new vote counts
//     const { error: updateTargetError } = await supabase
//       .from(config.table)
//       .update({
//         [config.upvoteField]: newUpvotes,
//         [config.downvoteField]: newDownvotes,
//         updated_at: new Date().toISOString()
//       })
//       .eq('id', targetId);
//     if (updateTargetError) return res.status(500).json({ error: updateTargetError.message });

//     return res.status(200).json({
//       success: true,
//       message: `${voteType} ${existingVote ? (existingVote.vote_type === voteType ? 'removed' : 'updated') : 'added'}!`,
//       data: {
//         total_upvotes: newUpvotes,
//         total_downvotes: newDownvotes,
//         net_score: Math.max(0, netScore), // Ensure net score is never negative
//         user_vote: user_vote
//       }
//     });

//   } catch (error: any) {
//     console.error('Error updating vote:', error);
//     return res.status(500).json({
//       success: false,
//       error: 'Failed to process vote'
//     });
//   }
// };

// const updateTotalSavedCounter = async (targetId: string, contentType: string, action: 'increment' | 'decrement') => {
//   const tableConfig = {
//     post: 'posts',
//     thread: 'threads',
//     comment: 'threadcomments',
//     subcomment: 'threadsubcomments'
//   };

//   const table = tableConfig[contentType as keyof typeof tableConfig];
  
//   if (!table) return;

//   try {
//     // Get current total_saved value
//     const { data: content, error } = await supabase
//       .from(table)
//       .select('total_saved')
//       .eq('id', targetId)
//       .single();

//     if (error || !content) {
//       console.error(`Error fetching ${contentType} data:`, error);
//       return;
//     }

//     // Calculate new total_saved value
//     const currentSaved = content.total_saved || 0;
//     const newSaved = action === 'increment' 
//       ? currentSaved + 1 
//       : Math.max(0, currentSaved - 1);

//     // Update the total_saved counter
//     const { error: updateError } = await supabase
//       .from(table)
//       .update({ total_saved: newSaved })
//       .eq('id', targetId);

//     if (updateError) {
//       console.error(`Error updating ${contentType} total_saved:`, updateError);
//     }

//     console.log(`Updated ${contentType} ${targetId} total_saved: ${currentSaved} → ${newSaved}`);
//   } catch (error) {
//     console.error(`Error in updateTotalSavedCounter for ${contentType}:`, error);
//   }
// };

// const updateSaveContent = async (
//   req: Request<{ targetId: string }, {}, SaveContentRequest>,
//   res: Response
// ): Promise<any> => {
//   const { targetId } = req.params;
//   const { contentType, threadId, postId, commentId, subcommentId } = req.body;
//   const { id: user_id } = req.user!;

//   try {
//     // Validate content type
//     const validContentTypes = ['post', 'thread', 'comment', 'subcomment'];
//     if (!validContentTypes.includes(contentType)) {
//       return res.status(400).json({ error: 'Invalid content type' });
//     }

//     let finalPostId = postId || null;
//     let finalThreadId = threadId || null;
//     let finalCommentId = commentId || null;
//     let finalSubcommentId = subcommentId || null;

//     // Verify the target content exists and set main content ID
//     const tableConfig = {
//       post: 'posts',
//       thread: 'threads',
//       comment: 'threadcomments',
//       subcomment: 'threadsubcomments'
//     };

//     const table = tableConfig[contentType as keyof typeof tableConfig];
//     const { data: content, error: contentError } = await supabase
//       .from(table)
//       .select('id')
//       .eq('id', targetId)
//       .single();

//     if (contentError || !content) {
//       return res.status(404).json({ error: `${contentType} not found` });
//     }

//     // Set the main content ID to match target_id
//     switch (contentType) {
//       case 'post':
//         finalPostId = targetId;
//         break;
//       case 'thread':
//         finalThreadId = targetId;
//         // If threadId is provided, ensure we have post_id for threads
//         if (finalThreadId && !finalPostId) {
//           const { data: thread, error: threadError } = await supabase
//             .from('threads')
//             .select('post_id')
//             .eq('id', targetId)
//             .single();
          
//           if (!threadError && thread) {
//             finalPostId = thread.post_id;
//           }
//         }
//         break;
//       case 'comment':
//         finalCommentId = targetId;
//         // If commentId is provided, ensure we have thread_id and post_id for comments
//         if (finalCommentId && (!finalThreadId || !finalPostId)) {
//           const { data: comment, error: commentError } = await supabase
//             .from('threadcomments')
//             .select('thread_id, post_id')
//             .eq('id', targetId)
//             .single();
          
//           if (!commentError && comment) {
//             finalThreadId = finalThreadId || comment.thread_id;
//             finalPostId = finalPostId || comment.post_id;
//           }
//         }
//         break;
//       case 'subcomment':
//         finalSubcommentId = targetId;
//         // If subcommentId is provided, ensure we have comment_id, thread_id, and post_id for subcomments
//         if (finalSubcommentId && (!finalCommentId || !finalThreadId || !finalPostId)) {
//           const { data: subcomment, error: subcommentError } = await supabase
//             .from('threadsubcomments')
//             .select('comment_id')
//             .eq('id', targetId)
//             .single();
          
//           if (!subcommentError && subcomment) {
//             finalCommentId = finalCommentId || subcomment.comment_id;
            
//             // Get parent comment for thread_id and post_id
//             if (finalCommentId) {
//               const { data: comment, error: commentError } = await supabase
//                 .from('threadcomments')
//                 .select('thread_id, post_id')
//                 .eq('id', finalCommentId)
//                 .single();
              
//               if (!commentError && comment) {
//                 finalThreadId = finalThreadId || comment.thread_id;
//                 finalPostId = finalPostId || comment.post_id;
//               }
//             }
//           }
//         }
//         break;
//     }

//     // Check if content already saved
//     const { data: existingSave, error: fetchError } = await supabase
//       .from('saved_content')
//       .select('id')
//       .eq('user_id', user_id)
//       .eq('target_id', targetId)
//       .eq('content_type', contentType)
//       .maybeSingle();

//     if (fetchError) {
//       return res.status(500).json({ error: fetchError.message });
//     }

//     if (existingSave) {
//       // Remove save (unsave)
//       const { error: deleteError } = await supabase
//         .from('saved_content')
//         .delete()
//         .eq('id', existingSave.id);

//       if (deleteError) {
//         return res.status(500).json({ error: deleteError.message });
//       }

//       // Decrement total_saved counter
//       await updateTotalSavedCounter(targetId, contentType, 'decrement');

//       return res.json({
//         success: true,
//         action: 'removed',
//         message: `${contentType} removed from saved`,
//         saved: false
//       });
//     } else {
//       // Add save - use the IDs provided in the request
//       const saveData: any = {
//         user_id,
//         content_type: contentType,
//         target_id: targetId,
//         post_id: finalPostId,
//         thread_id: finalThreadId,
//         comment_id: finalCommentId,
//         subcomment_id: finalSubcommentId
//       };

//       console.log('Inserting save data:', saveData);

//       const { data: newSave, error: insertError } = await supabase
//         .from('saved_content')
//         .insert(saveData)
//         .select()
//         .single();

//       if (insertError) {
//         console.error('Insert error details:', insertError);
//         return res.status(500).json({ error: insertError.message });
//       }

//       // Increment total_saved counter
//       await updateTotalSavedCounter(targetId, contentType, 'increment');

//       return res.json({
//         success: true,
//         action: 'added',
//         message: `${contentType} saved successfully`,
//         saved: true,
//         data: newSave
//       });
//     }
//   } catch (error: any) {
//     console.error('Error in updateSaveContent:', error);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// };

// export const getSavedContent = async (req: Request, res: Response): Promise<any> => {
//   const { id: user_id } = req.user!;
//   const { contentType, limit = '10', offset = '0' } = req.query;

//   const validContentTypes = ['post', 'thread', 'comment', 'subcomment'];
//   const contentFilter = contentType as string;
  
//   if (contentFilter && !validContentTypes.includes(contentFilter)) {
//     return res.status(400).json({ error: 'Invalid content type' });
//   }

//   try {
//     let query = supabase
//       .from('saved_content')
//       .select(`
//         *,
//         posts:post_id(*, profiles:user_id(username, avatar_url, first_name, last_name)),
//         threads:thread_id(*, profiles:user_id(username, avatar_url, first_name, last_name)),
//         comments:comment_id(*, 
//           profiles:user_id(username, avatar_url, first_name, last_name),
//           threads:thread_id(id, title),
//           posts:post_id(id, title)
//         ),
//         subcomments:subcomment_id(*, 
//           profiles:user_id(username, avatar_url, first_name, last_name),
//           threadcomments:comment_id(id, content, thread_id, post_id)
//         )
//       `)
//       .eq('user_id', user_id)
//       .order('created_at', { ascending: false })
//       .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

//     if (contentFilter) {
//       query = query.eq('content_type', contentFilter);
//     }

//     const { data: savedItems, error } = await query;

//     if (error) {
//       console.error('Error fetching saved content:', error);
//       return res.status(500).json({ error: error.message });
//     }

//     const enrichedItems = await Promise.all(
//       savedItems.map(async (item) => {
//         let contentData: any = {};
//         let authorProfile = null;
//         let parentInfo = null;

//         switch (item.content_type) {
//           case 'post':
//             contentData = item.posts;
//             authorProfile = item.posts?.profiles;
//             break;
//           case 'thread':
//             contentData = item.threads;
//             authorProfile = item.threads?.profiles;
//             break;
//           case 'comment':
//             contentData = item.comments;
//             authorProfile = item.comments?.profiles;
//             // Get parent thread/post info for comments
//             if (item.comments?.thread_id) {
//               const { data: thread } = await supabase
//                 .from('threads')
//                 .select('title')
//                 .eq('id', item.comments.thread_id)
//                 .single();
//               parentInfo = { type: 'thread', title: thread?.title, id: item.comments.thread_id };
//             } else if (item.comments?.post_id) {
//               const { data: post } = await supabase
//                 .from('posts')
//                 .select('title')
//                 .eq('id', item.comments.post_id)
//                 .single();
//               parentInfo = { type: 'post', title: post?.title, id: item.comments.post_id };
//             }
//             break;
//           case 'subcomment':
//             contentData = item.subcomments;
//             authorProfile = item.subcomments?.profiles;
//             // Get parent comment and thread info for subcomments
//             if (item.subcomments?.comment_id) {
//               const { data: parentComment } = await supabase
//                 .from('threadcomments')
//                 .select('content, thread_id, post_id')
//                 .eq('id', item.subcomments.comment_id)
//                 .single();
              
//               if (parentComment?.thread_id) {
//                 const { data: thread } = await supabase
//                   .from('threads')
//                   .select('title')
//                   .eq('id', parentComment.thread_id)
//                   .single();
//                 parentInfo = { 
//                   type: 'thread', 
//                   title: thread?.title, 
//                   id: parentComment.thread_id,
//                   parentComment: parentComment.content
//                 };
//               } else if (parentComment?.post_id) {
//                 const { data: post } = await supabase
//                   .from('posts')
//                   .select('title')
//                   .eq('id', parentComment.post_id)
//                   .single();
//                 parentInfo = { 
//                   type: 'post', 
//                   title: post?.title, 
//                   id: parentComment.post_id,
//                   parentComment: parentComment.content
//                 };
//               }
//             }
//             break;
//         }

//         return {
//           id: item.id,
//           content_type: item.content_type,
//           target_id: item.target_id,
//           created_at: item.created_at,
//           content: contentData,
//           author: authorProfile,
//           parent_info: parentInfo,
//           post_id: item.post_id,
//           thread_id: item.thread_id,
//           comment_id: item.comment_id,
//           subcomment_id: item.subcomment_id
//         };
//       })
//     );

//     return res.json({
//       success: true,
//       data: enrichedItems,
//       pagination: {
//         limit: parseInt(limit as string),
//         offset: parseInt(offset as string),
//         total: enrichedItems.length
//       }
//     });

//   } catch (error: any) {
//     console.error('Error in getSavedContent:', error);
//     return res.status(500).json({ 
//       success: false,
//       error: 'Internal server error',
//       message: error.message 
//     });
//   }
// };

// export {
//   createComment,
//   deleteComment,
//   updateComment,
//   getComments,
//   updateCommentReaction,
//   updateCommentsVote,
//   updateSaveContent,
// };

