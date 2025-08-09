import { Request, Response } from 'express';
import { supabase } from '../../app';
import { sendNotification } from '../../sockets/emitNotification';


function getTargetInfo(req: Request) {
  const { thread_id, post_id } = req.body;
  if (thread_id) return { targetType: 'thread', targetId: thread_id };
  if (post_id) return { targetType: 'post', targetId: post_id };
  throw new Error('Either thread_id or post_id is required!');
}

// add new comment
const createComment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { content, imgs = [] } = req.body;
    const { id: user_id, first_name, last_name, email } = req.user!;
    const { targetType, targetId } = getTargetInfo(req);

    if (!content || !user_id || !first_name) {
      return res.status(400).json({ error: 'Missing required fields!' });
    }

    let parentData, parentError, authorId, parentTitle;
    if (targetType === 'thread') {
      ({ data: parentData, error: parentError } = await supabase
        .from('threads')
        .select('id, author_id, title')
        .eq('id', targetId)
        .eq('is_deleted', false)
        .single());
      authorId = parentData?.author_id;
      parentTitle = parentData?.title;
    } else {
      ({ data: parentData, error: parentError } = await supabase
        .from('posts')
        .select('id, user_id, content')
        .eq('id', targetId)
        .eq('is_active', true)
        .single());
      authorId = parentData?.user_id;
      parentTitle = parentData?.content?.slice(0, 30) || 'a post';
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
    else insertObj.post_id = targetId;

    const { data, error } = await supabase
      .from('threadcomments')
      .insert([insertObj])
      .select();

    // Notification (don't notify self)
    if (authorId && authorId !== user_id) {
      // Get author email
      const { data: authorProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', authorId)
        .single();

      if (authorProfile) {
        await sendNotification({
          recipientEmail: authorProfile.email,
          recipientUserId: authorId,
          actorUserId: user_id,
          threadId: targetId, // always use threadId for NotificationInput
          message: `Comment posted! +5 soulpoints added to your profile`,
          type: targetType === 'thread' ? 'comment' : 'post_comment',
          metadata: {
            [`${targetType}_id`]: targetId,
            commenter_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
          },
        });
      }
    }

    if (error) {
      return res.status(500).json({ error: error.message || 'Unknown error occurred while creating comment.' });
    }
    if (!data || data.length === 0) {
      return res.status(500).json({ error: 'Comment creation failed. No data returned.' });
    }

    return res.status(201).json({ message: 'Comment created successfully!' });
  } catch (err: any) {
    return res.status(500).json({
      error: 'Internal server error while creating comment.',
      message: err.message || 'Unexpected failure.',
    });
  }
};

// delete comment
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

// update comment
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

// get all comment by thread_id
const getComments = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { thread_id, post_id } = req.query;
    const user_id = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    let filterKey: 'thread_id' | 'post_id', filterValue: string;
    if (thread_id) {
      filterKey = 'thread_id';
      filterValue = thread_id as string;
    } else if (post_id) {
      filterKey = 'post_id';
      filterValue = post_id as string;
    } else {
      return res.status(400).json({ error: 'thread_id or post_id is required!' });
    }

    const { data: comments, error } = await supabase
      .from('threadcomments')
      .select(`*, profiles!inner(id, first_name, last_name, avatar_url, email)`)
      .eq(filterKey, filterValue)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: "Comment fetching failed!" });
    }

    const commentsWithReactions = await Promise.all(comments.map(async (comment) => {
      let userReaction = null;
      if (user_id) {
        const { data: reactionData } = await supabase
          .from('thread_reactions')
          .select('type')
          .eq('user_id', user_id)
          .eq('target_type', 'comment')
          .eq('target_id', comment.id)
          .maybeSingle();
        if (reactionData) userReaction = reactionData.type;
      }
      return { ...comment, user_reaction: userReaction };
    }));

    return res.status(200).json({ comments: commentsWithReactions });
  }
  catch (err: any) {
    return res.status(500).json({
      error: err.message || 'Unexpected failure.',
    });
  }
};

// apply like/dislike
const updateCommentReaction = async (
  req: Request<{ comment_id: string }, {}, { type: 'like' | 'dislike' }>,
  res: Response
): Promise<any> => {
  const { comment_id } = req.params;
  const { type } = req.body;
  const { id: user_id } = req.user!;

  if (!user_id) {
    return res.status(400).json({ error: 'Invalid user.' });
  }

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

  // Fetch comment, including both thread_id and post_id
  const { data: commentData, error: commentError } = await supabase
    .from('threadcomments')
    .select(`
      total_likes, 
      total_dislikes, 
      user_id, 
      content,
      thread_id,
      post_id,
      is_deleted
    `)
    .eq('id', comment_id)
    .eq('is_deleted', false)
    .single();

  if (commentError || !commentData) {
    return res.status(404).json({ error: 'Comment not found!' });
  }

  // Determine if this is a thread or post comment
  let parentType: 'thread' | 'post', parentId: string, parentTitle: string, parentAuthorId: string;
  if (commentData.thread_id) {
    parentType = 'thread';
    parentId = commentData.thread_id;
    // Fetch thread info
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
    // Fetch post info
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
  } else {
    return res.status(400).json({ error: 'Comment is not linked to a thread or post.' });
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

  let newTotalLikes = commentData?.total_likes ?? 0;
  let newTotalDislikes = commentData?.total_dislikes ?? 0;

  const getReactionDisplayName = (reactionType: 'like' | 'dislike'): string => {
    return reactionType === 'like' ? 'like' : 'dislike';
  };

  const getCommentPreview = (content: string): string => {
    const words = content.split(' ');
    return words.length > 5
      ? words.slice(0, 5).join(' ') + '...'
      : content;
  };

  if (existing) {
    if (existing.type === type) {
      if (type === 'like') newTotalLikes = Math.max(0, newTotalLikes - 1);
      if (type === 'dislike') newTotalDislikes = Math.max(0, newTotalDislikes - 1);

      const { error: deleteError } = await supabase
        .from('thread_reactions')
        .delete()
        .eq('id', existing.id);

      if (deleteError) return res.status(500).json({ error: deleteError.message });

      const { error: updateCommentError } = await supabase
        .from('threadcomments')
        .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
        .eq('id', comment_id);

      if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

      if (shouldSendNotification && authorProfile) {
        await sendNotification({
          recipientEmail: authorProfile.email,
          recipientUserId: commentData.user_id,
          actorUserId: user_id,
          threadId: parentId, // always use threadId for NotificationInput
          message: `_${getReactionDisplayName(type)}_ reaction was removed from your comment: "${getCommentPreview(commentData.content)}" on ${parentType} **${truncatedTitle}**`,
          type: parentType === 'thread' ? 'reaction_removed' : 'post_comment_reaction_removed',
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

      return res.status(200).json({ message: `${type} removed!` });
    }

    if (existing.type === 'like') {
      newTotalLikes = Math.max(0, newTotalLikes - 1);
      newTotalDislikes += 1;
    } else {
      newTotalDislikes = Math.max(0, newTotalDislikes - 1);
      newTotalLikes += 1;
    }

    const { error: updateError } = await supabase
      .from('thread_reactions')
      .update({ type, updated_by: user_id })
      .eq('id', existing.id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    const { error: updateCommentError } = await supabase
      .from('threadcomments')
      .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
      .eq('id', comment_id);

    if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

    if (shouldSendNotification && authorProfile) {
      await sendNotification({
        recipientEmail: authorProfile.email,
        recipientUserId: commentData.user_id,
        actorUserId: user_id,
        threadId: parentId,
        message: `**@someone** changed their reaction to _${getReactionDisplayName(type)}_ on your comment: "${getCommentPreview(commentData.content)}" on ${parentType} **${truncatedTitle}**`,
        type: parentType === 'thread' ? 'reaction_updated' : 'post_comment_reaction_updated',
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

    return res.status(200).json({ message: `Reaction updated to ${type}!` });
  } else {
    if (type === 'like') newTotalLikes += 1;
    if (type === 'dislike') newTotalDislikes += 1;

    const { error: insertError } = await supabase
      .from('thread_reactions')
      .insert([{ user_id, target_id: comment_id, target_type: 'comment', type }]);

    if (insertError) return res.status(500).json({ error: insertError.message });

    const { error: updateCommentError } = await supabase
      .from('threadcomments')
      .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
      .eq('id', comment_id);

    if (updateCommentError) return res.status(500).json({ error: updateCommentError.message });

    if (shouldSendNotification && authorProfile) {
      const soulpointsMap: Record<'like' | 'dislike', number> = {
        'like': 1,
        'dislike': 0
      };

      const soulpoints = soulpointsMap[type] || 0;

      await sendNotification({
        recipientEmail: authorProfile.email,
        recipientUserId: commentData.user_id,
        actorUserId: user_id,
        threadId: parentId,
        message: `Received _${getReactionDisplayName(type)}_ reaction on your comment: "${getCommentPreview(commentData.content)}" on ${parentType} **${truncatedTitle}**`,
        type: parentType === 'thread' ? 'reaction_added' : 'post_comment_reaction_added',
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

    return res.status(200).json({ message: `${type} added!` });
  }
};

export {
  createComment,
  deleteComment,
  updateComment,
  getComments,
  updateCommentReaction,
};

