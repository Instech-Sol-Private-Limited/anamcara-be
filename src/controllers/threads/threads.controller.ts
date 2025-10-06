import { Request, Response } from 'express';
import { supabase } from '../../app';
import { sendNotification } from '../../sockets/emitNotification';

type ReactionType = 'like' | 'dislike' | 'insightful' | 'heart' | 'hug' | 'soul' | 'support' | 'valuable' | 'funny' | 'shocked' | 'moved' | 'triggered';
type VoteType = 'upvote' | 'downvote';
type VoteTargetType = 'post' | 'thread';

type TotalKey =
  | 'total_likes'
  | 'total_dislikes'
  | 'total_insightfuls'
  | 'total_hearts'
  | 'total_hugs'
  | 'total_souls'
  | 'total_supports'
  | 'total_valuables'
  | 'total_funnies'
  | 'total_shockeds'
  | 'total_moveds'
  | 'total_triggereds';

type ThreadReaction = {
  id: string;
  user_id: string;
  target_id: string;
  target_type: string;
  type: ReactionType;
};

type ThreadFieldMap = {
  [key in ReactionType]: 'total_likes' | 'total_dislikes' | 'total_insightfuls' | 'total_hearts' | 'total_hugs' | 'total_souls' | 'total_supports' | 'total_valuables' | 'total_funnies' | 'total_shockeds' | 'total_moveds' | 'total_triggereds';
};

const fieldMap: Record<ReactionType, TotalKey> = {
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
  triggered: 'total_triggereds',
};

type ThreadData = {
  author_id: string;
  title: string;
  is_deleted: boolean;
  is_chamber_thread: boolean;
  chamber_id: string | null;
} & Partial<Record<TotalKey, number>>;

const soulpointsMap: Record<ReactionType, number> = {
  like: 1,
  dislike: 0,
  insightful: 3,
  heart: 2,
  hug: 2,
  soul: 4,
  support: 2,
  valuable: 3,
  funny: 1,
  shocked: 1,
  moved: 2,
  triggered: 0,
};

// add new thread
const createThread = async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      title,
      description,
      imgs = [],
      category_id,
      keywords = [],
      whisper_mode = false,
      disclaimers = []
    } = req.body;

    const { id: author_id, first_name, last_name, email } = req.user!;

    const requiredFields = {
      title,
      description,
      category_id,
      author_id,
      author_name: first_name,
    };

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
        return res.status(400).json({ error: `${formattedKey} is required!` });
      }
    }

    if (disclaimers && !Array.isArray(disclaimers)) {
      return res.status(400).json({ error: 'Disclaimers must be an array' });
    }

    const enabledDisclaimers = disclaimers
      ? disclaimers.filter((d: any) => d.enabled === true)
      : null;

    const { data: categoryData, error: categoryError } = await supabase
      .from('threadcategory')
      .select('category_name')
      .eq('id', category_id)
      .single();

    if (categoryError || !categoryData) {
      return res.status(400).json({ error: 'Invalid Category Id. No matching category found.' });
    }

    const { category_name } = categoryData;

    const { data, error } = await supabase
      .from('threads')
      .insert([{
        title,
        description,
        imgs,
        category_id,
        category_name,
        author_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
        author_id,
        keywords,
        whisper_mode,
        disclaimers: enabledDisclaimers
      }])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({
        error: error.message || 'Unknown error occurred while creating thread.',
        details: error.details || null,
        hint: error.hint || null,
      });
    }

    if (!data || data.length === 0) {
      return res.status(500).json({ error: 'Thread creation failed. No data returned.' });
    }

    const threadId = data[0].id;

    await sendNotification({
      recipientEmail: email,
      recipientUserId: author_id,
      actorUserId: null,
      threadId: threadId,
      message: 'Thread created successfully! +10 soulpoints added to your profile',
      type: 'thread_creation',
      metadata: {
        soulpoints: 10,
        thread_id: threadId,
        thread_title: title
      }
    });

    return res.status(201).json({
      message: 'Thread created successfully!',
    });

  } catch (err: any) {
    console.error('Unexpected error in createThread:', err);
    return res.status(500).json({
      error: 'Internal server error while creating thread.',
      message: err.message || 'Unexpected failure.',
    });
  }
};

// delete thread
const deleteThread = async (
  req: Request<{ thread_id: string }> & { user?: { id: string; role?: string } },
  res: Response
): Promise<any> => {
  try {
    const { thread_id } = req.params;
    const { id: user_id, role } = req.user!;

    const { data: thread, error: fetchError } = await supabase
      .from('threads')
      .select('id, author_id')
      .eq('id', thread_id)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !thread) {
      return res.status(404).json({ error: 'Thread not found!' });
    }

    const isAuthor = thread.author_id === user_id;
    const isSuperadmin = role === 'superadmin';

    if (!isAuthor && !isSuperadmin) {
      return res.status(403).json({ error: 'Permission denied!' });
    }

    const { error: deleteError } = await supabase
      .from('threads')
      .update({
        is_deleted: true,
      })
      .eq('id', thread_id);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    return res.status(200).json({ message: 'Thread deleted successfully!' });

  } catch (err: any) {
    console.error('Unexpected error in deleteThread:', err);
    return res.status(500).json({
      error: 'Internal server error while deleting thread.',
      message: err.message || 'Unexpected failure.',
    });
  }
};

// update thread
const updateThread = async (req: Request, res: Response): Promise<any> => {
  try {
    const { thread_id } = req.params;
    const {
      title,
      description,
      imgs = [],
      category_id,
      keywords = [],
      whisper_mode = false,
    } = req.body;

    const { id: author_id, first_name, last_name, role } = req.user!;

    const { data: existingThread, error: threadError } = await supabase
      .from('threads')
      .select('*')
      .eq('id', thread_id)
      .eq('is_deleted', false)
      .single();

    if (threadError || !existingThread) {
      return res.status(404).json({ error: 'Thread not found!' });
    }

    const isAuthor = existingThread.author_id === author_id;
    const isSuperadmin = role === 'superadmin';

    if (!isAuthor && !isSuperadmin) {
      return res.status(403).json({ error: 'Permission denied!' });
    }

    const requiredFields = {
      title,
      description,
      category_id,
      author_id,
      author_name: first_name,
    };

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
        return res.status(400).json({ error: `${formattedKey} is required!` });
      }
    }

    const { data: categoryData, error: categoryError } = await supabase
      .from('threadcategory')
      .select('category_name')
      .eq('id', category_id)
      .single();

    if (categoryError || !categoryData) {
      return res.status(400).json({ error: 'Invalid Category Id. No matching category found.' });
    }

    const { category_name } = categoryData;

    const { error: updateError } = await supabase
      .from('threads')
      .update({
        title,
        description,
        imgs,
        category_id,
        category_name,
        author_name: `${first_name}${last_name ? ` ${last_name}` : ''}`,
        author_id,
        keywords,
        whisper_mode,
        updated_by: author_id,
        is_edited: true
      })
      .eq('id', thread_id);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return res.status(500).json({
        error: updateError.message || 'Unknown error occurred while updating thread.',
        details: updateError.details || null,
        hint: updateError.hint || null,
      });
    }

    return res.status(200).json({
      message: 'Thread updated successfully!',
    });

  } catch (err: any) {
    console.error('Unexpected error in updateThread:', err);
    return res.status(500).json({
      error: 'Internal server error while updating thread.',
      message: err.message || 'Unexpected failure.',
    });
  }
};

// get thread details
const getThreadDetails = async (req: Request<{ thread_id: string }>, res: Response): Promise<any> => {
  try {
    const { thread_id } = req.params;
    const user_id = req.user?.id;

    if (!thread_id) {
      return res.status(400).json({ error: 'Thread ID is required in the request parameters.' });
    }

    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .select(`
        *,
        profiles!inner(avatar_url)
      `)
      .eq('id', thread_id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .maybeSingle();

    if (threadError || !thread) {
      return res.status(404).json({ error: 'Thread not found!' });
    }

    let userReaction: string | null = null;

    if (user_id) {
      const { data: reactionData, error: reactionError } = await supabase
        .from('thread_reactions')
        .select('type')
        .eq('user_id', user_id)
        .eq('target_type', 'thread')
        .eq('target_id', thread_id)
        .maybeSingle();

      if (!reactionError && reactionData) {
        userReaction = reactionData.type;
      }
    }

    const { data: comments, error: commentsError } = await supabase
      .from('threadcomments')
      .select('id, thread_id, content, is_deleted')
      .eq('thread_id', thread_id)
      .eq('is_deleted', false);

    if (commentsError) {
      return res.status(500).json({ error: 'Error fetching comments' });
    }

    const commentIds = comments?.map(c => c.id) || [];

    const subcommentsPromises = commentIds.map(commentId =>
      supabase
        .from('threadsubcomments')
        .select('id, comment_id, is_deleted')
        .eq('comment_id', commentId)
        .eq('is_deleted', false)
    );

    const subcommentsResults = await Promise.all(subcommentsPromises);

    let total_subcomments = 0;
    for (const result of subcommentsResults) {
      const { data: subcomments, error: subcommentsError } = result;
      if (subcommentsError) {
        return res.status(500).json({ error: 'Error fetching replies' });
      }
      total_subcomments += subcomments?.length || 0;
    }

    return res.json({
      ...thread,
      user_reaction: userReaction,
      total_comments: (comments?.length || 0) + total_subcomments,
    });
  } catch (err) {
    console.error('getThreadDetails error:', err);
    return res.status(500).json({ error: 'Something went wrong!' });
  }
};

// get all threads
const getAllThreads = async (req: Request, res: Response): Promise<any> => {
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;
  const user_id = req.user?.id;

  try {
    let spammedThreadIds: string[] = [];

    if (user_id) {
      const { data: spammed, error: spamError } = await supabase
        .from('threads_spam')
        .select('thread_id')
        .eq('user_id', user_id);

      if (spamError) {
        console.error('Error fetching spammed threads:', spamError);
        return res.status(500).json({ error: 'Failed to fetch spammed threads.' });
      }

      spammedThreadIds = spammed?.map(item => item.thread_id) || [];
    }

    const { data: allThreads, error: threadError } = await supabase
      .from('threads')
      .select(`
        *,
        profiles!inner(avatar_url)
      `)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('publish_date', { ascending: false });

    if (threadError) return res.status(500).json({ error: threadError.message });

    const filteredThreads = allThreads.filter(thread => !spammedThreadIds.includes(thread.id));
    const paginatedThreads = filteredThreads.slice(offset, offset + limit);

    const threadsWithDetails = await Promise.all(
      paginatedThreads.map(async (thread) => {
        let userReaction: string | null = null;
        let userSaved = false;

        if (user_id) {
          const { data: reactionData } = await supabase
            .from('thread_reactions')
            .select('type')
            .eq('user_id', user_id)
            .eq('target_type', 'thread')
            .eq('target_id', thread.id)
            .maybeSingle();

          if (reactionData) userReaction = reactionData.type;

          const { data: savedData } = await supabase
            .from('saved_posts')
            .select('id')
            .eq('user_id', user_id)
            .eq('target_id', thread.id)
            .eq('target_type', 'thread')
            .maybeSingle();

          if (savedData) userSaved = true;
        }

        const { data: comments } = await supabase
          .from('threadcomments')
          .select('id')
          .eq('thread_id', thread.id)
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
          ...thread,
          user_reaction: userReaction,
          user_saved: userSaved,
          total_comments: totalComments + totalReplies,
          total_supports: thread.total_supports || 0,
          total_valuables: thread.total_valuables || 0,
          total_funnies: thread.total_funnies || 0,
          total_shockeds: thread.total_shockeds || 0,
          total_moveds: thread.total_moveds || 0,
          total_triggereds: thread.total_triggereds || 0,
          total_upvotes: thread.total_upvotes || 0,
          total_downvotes: thread.total_downvotes || 0,
          total_echos: thread.total_echos || 0,
          total_saved: thread.total_saved || 0,
        };
      })
    );

    return res.json(threadsWithDetails);
  } catch (err: any) {
    console.error('getAllThreads error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

const getReactionDisplayName = (reactionType: ReactionType): string => {
  const displayNames: Record<ReactionType, string> = {
    like: 'like',
    dislike: 'dislike',
    insightful: 'insightful',
    heart: 'heart',
    hug: 'hug',
    soul: 'soul',
    support: 'support',
    valuable: 'valuable',
    funny: 'funny',
    shocked: 'shocked',
    moved: 'moved',
    triggered: 'triggered',
  };
  return displayNames[reactionType] || reactionType;
};

const updateReaction = async (
  req: Request<{ thread_id: string }, {}, { type: ReactionType }>,
  res: Response
): Promise<any> => {
  try {
    const { thread_id } = req.params;
    const { type } = req.body;
    const user_id = (req.user as { id?: string })?.id;

    if (!user_id || !fieldMap[type]) {
      return res.status(400).json({ error: 'Invalid user or reaction type.' });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('thread_reactions')
      .select('*')
      .eq('user_id', user_id)
      .eq('target_id', thread_id)
      .eq('target_type', 'thread')
      .maybeSingle<ThreadReaction>();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    const { data: threadData, error: threadError } = await supabase
      .from('threads')
      .select(`
        author_id,
        title,
        is_deleted,
        total_likes,
        total_dislikes,
        total_insightfuls,
        total_hearts,
        total_hugs,
        total_souls,
        total_supports,
        total_valuables,
        total_funnies,
        total_shockeds,
        total_moveds,
        total_triggereds,
        total_upvotes,
        total_downvotes,
        total_echos,
        total_saved
      `)
      .eq('id', thread_id)
      .eq('is_deleted', false)
      .maybeSingle<ThreadData>();

    if (threadError || !threadData) {
      return res.status(404).json({ error: 'Thread not found!' });
    }

    const shouldSendNotification = threadData.author_id !== user_id;

    let authorProfile: { email?: string; first_name?: string; last_name?: string } | null = null;
    if (shouldSendNotification) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', threadData.author_id)
        .maybeSingle();

      if (!profileError && profileData) authorProfile = profileData;
    }

    const updates: Record<TotalKey, number> = {
      total_likes: threadData.total_likes ?? 0,
      total_dislikes: threadData.total_dislikes ?? 0,
      total_insightfuls: threadData.total_insightfuls ?? 0,
      total_hearts: threadData.total_hearts ?? 0,
      total_hugs: threadData.total_hugs ?? 0,
      total_souls: threadData.total_souls ?? 0,
      total_supports: threadData.total_supports ?? 0,
      total_valuables: threadData.total_valuables ?? 0,
      total_funnies: threadData.total_funnies ?? 0,
      total_shockeds: threadData.total_shockeds ?? 0,
      total_moveds: threadData.total_moveds ?? 0,
      total_triggereds: threadData.total_triggereds ?? 0,
    };

    if (existing) {
      if (existing.type === type) {
        // Remove reaction (same type clicked)
        const field = fieldMap[type];
        updates[field] = Math.max(0, updates[field] - 1);

        // Delete reaction record
        const { error: deleteError } = await supabase
          .from('thread_reactions')
          .delete()
          .eq('id', existing.id);

        if (deleteError) return res.status(500).json({ error: deleteError.message });

        // Update thread counts
        const { error: updateThreadError } = await supabase
          .from('threads')
          .update({ [field]: updates[field] })
          .eq('id', thread_id);

        if (updateThreadError) return res.status(500).json({ error: updateThreadError.message });

        // Send notification for reaction removal
        if (shouldSendNotification && authorProfile?.email) {
          await sendNotification({
            recipientEmail: authorProfile.email,
            recipientUserId: threadData.author_id,
            actorUserId: user_id,
            threadId: thread_id,
            message: `_${getReactionDisplayName(type)}_ reaction was removed from your thread **${threadData.title.length > 40 ? threadData.title.slice(0, 40) + '...' : threadData.title}**`,
            type: 'thread_reaction_removed',
            metadata: { reaction_type: type, thread_id, actor_user_id: user_id },
          });
        }

        return res.status(200).json({ message: `${type} removed!` });
      }

      // Change reaction type
      const prevField = fieldMap[existing.type];
      const currentField = fieldMap[type];

      updates[prevField] = Math.max(0, updates[prevField] - 1);
      updates[currentField] = updates[currentField] + 1;

      // Update reaction record
      const { error: updateReactionError } = await supabase
        .from('thread_reactions')
        .update({ type, updated_by: user_id })
        .eq('id', existing.id);

      if (updateReactionError) return res.status(500).json({ error: updateReactionError.message });

      // Update thread counts
      const { error: updateThreadError } = await supabase
        .from('threads')
        .update({
          [prevField]: updates[prevField],
          [currentField]: updates[currentField],
        })
        .eq('id', thread_id);

      if (updateThreadError) return res.status(500).json({ error: updateThreadError.message });

      // Send notification for reaction change
      if (shouldSendNotification && authorProfile?.email) {
        await sendNotification({
          recipientEmail: authorProfile.email,
          recipientUserId: threadData.author_id,
          actorUserId: user_id,
          threadId: thread_id,
          message: `**@someone** changed their reaction to _${getReactionDisplayName(type)}_ on your thread **${threadData.title.length > 40 ? threadData.title.slice(0, 40) + '...' : threadData.title}**`,
          type: 'thread_reaction_updated',
          metadata: {
            previous_reaction_type: existing.type,
            new_reaction_type: type,
            thread_id,
            actor_user_id: user_id,
          },
        });
      }

      return res.status(200).json({ message: `Reaction updated to ${type}!` });
    }

    // CASE B: No existing reaction -> insert new reaction
    const field = fieldMap[type];
    updates[field] = updates[field] + 1;

    // Insert new reaction record
    const { error: insertError } = await supabase
      .from('thread_reactions')
      .insert([{ user_id, target_id: thread_id, target_type: 'thread', type }]);

    if (insertError) return res.status(500).json({ error: insertError.message });

    // Update thread counts
    const { error: updateThreadError } = await supabase
      .from('threads')
      .update({ [field]: updates[field] })
      .eq('id', thread_id);

    if (updateThreadError) return res.status(500).json({ error: updateThreadError.message });

    // Send notification for new reaction
    if (shouldSendNotification && authorProfile?.email) {
      // Award soulpoints based on reaction type
      const soulpoints = soulpointsMap[type] ?? 0;

      if (soulpoints > 0) {
        const { error: soulpointsError } = await supabase.rpc('increment_soulpoints', {
          p_user_id: threadData.author_id,
          p_points: soulpoints,
        });

        if (soulpointsError) console.error('Error updating soulpoints:', soulpointsError);
      }

      await sendNotification({
        recipientEmail: authorProfile.email,
        recipientUserId: threadData.author_id,
        actorUserId: user_id,
        threadId: thread_id,
        message: `**@someone** reacted with _${getReactionDisplayName(type)}_ on your thread **${threadData.title.length > 40 ? threadData.title.slice(0, 40) + '...' : threadData.title}** ${soulpoints > 0 ? `(+${soulpoints} soulpoints)` : ''}`,
        type: 'thread_reaction_added',
        metadata: {
          reaction_type: type,
          thread_id,
          actor_user_id: user_id,
          soulpoints,
        },
      });
    }

    return res.status(200).json({ message: `${type} added!` });
  } catch (err: any) {
    console.error('updateReaction error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal error' });
  }
};

const updateVote = async (
  req: Request<{ targetId: string }, {}, { voteType: VoteType; targetType: VoteTargetType }>,
  res: Response
): Promise<any> => {
  const { targetId } = req.params;
  const { voteType, targetType } = req.body;
  const { id: user_id } = req.user!;

  if (!user_id || !['upvote', 'downvote'].includes(voteType) || !['post', 'thread'].includes(targetType)) {
    return res.status(400).json({ error: 'Invalid user, vote type, or target type.' });
  }

  try {
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

    const tableName = targetType === 'post' ? 'posts' : 'threads';
    const { data: targetData, error: targetError } = await supabase
      .from(tableName)
      .select('total_upvotes, total_downvotes, author_id')
      .eq('id', targetId)
      .single();

    if (targetError || !targetData) {
      return res.status(404).json({ error: `${targetType} not found!` });
    }

    const currentUpvotes = targetData.total_upvotes || 0;
    const currentDownvotes = targetData.total_downvotes || 0;

    let newUpvotes = currentUpvotes;
    let newDownvotes = currentDownvotes;

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        const { error: deleteError } = await supabase
          .from('post_votes')
          .delete()
          .eq('id', existingVote.id);

        if (deleteError) return res.status(500).json({ error: deleteError.message });

        if (voteType === 'upvote') {
          newUpvotes = Math.max(0, currentUpvotes - 20);
        } else {
          newDownvotes = Math.max(0, currentDownvotes - 5);
        }
      } else {
        const { error: updateError } = await supabase
          .from('post_votes')
          .update({ vote_type: voteType, updated_at: new Date().toISOString() })
          .eq('id', existingVote.id);

        if (updateError) return res.status(500).json({ error: updateError.message });

        if (existingVote.vote_type === 'upvote') {
          newUpvotes = Math.max(0, currentUpvotes - 20);
          newDownvotes = currentDownvotes + 5;
        } else {
          newUpvotes = currentUpvotes + 20;
          newDownvotes = Math.max(0, currentDownvotes - 5);
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
        newUpvotes = currentUpvotes + 20;
      } else {
        newDownvotes = currentDownvotes + 5;
      }
    }

    const { error: updateTargetError } = await supabase
      .from(tableName)
      .update({
        total_upvotes: newUpvotes,
        total_downvotes: newDownvotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetId);

    if (updateTargetError) return res.status(500).json({ error: updateTargetError.message });

    const netScore = newUpvotes - newDownvotes;

    return res.status(200).json({
      message: `${voteType} ${existingVote ? (existingVote.vote_type === voteType ? 'removed' : 'updated') : 'added'}!`,
      data: {
        total_upvotes: newUpvotes,
        total_downvotes: newDownvotes,
        net_score: netScore,
        user_vote: existingVote?.vote_type === voteType ? null : voteType
      }
    });

  } catch (error: any) {
    console.error('Error updating vote:', error);
    return res.status(500).json({ error: 'Failed to process vote' });
  }
};

const getThreadsByUserId = async (req: Request, res: Response): Promise<any> => {
  try {
    const { user_id } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const current_user_id = req.user?.id;

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required in the request parameters.' });
    }

    const { data: threads, error } = await supabase
      .from('threads')
      .select(`
        *,
        profiles!inner(avatar_url)
      `)
      .eq('author_id', user_id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('publish_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    const threadsWithReactions = await Promise.all(threads.map(async (thread) => {
      let userReaction = null;

      if (current_user_id) {
        const { data: reactionData, error: reactionError } = await supabase
          .from('thread_reactions')
          .select('type')
          .eq('user_id', current_user_id)
          .eq('target_type', 'thread')
          .eq('target_id', thread.id)
          .maybeSingle();

        if (!reactionError && reactionData) {
          userReaction = reactionData.type;
        }
      }

      const { data: comments } = await supabase
        .from('threadcomments')
        .select('id, thread_id, content, is_deleted')
        .eq('thread_id', thread.id)
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
        ...thread,
        user_reaction: userReaction,
        total_comments: totalComments + totalReplies,
      };
    }));

    return res.status(200).json({
      threads: threadsWithReactions,
      pagination: {
        limit,
        offset,
        count: threadsWithReactions.length
      }
    });
  } catch (err: any) {
    console.error('Unexpected error in getThreadsByUserId:', err);
    return res.status(500).json({
      error: 'Internal server error while fetching threads.',
      message: err.message || 'Unexpected failure.',
    });
  }
};

const toggleThreadStatus = async (
  req: Request<{ thread_id: string }, {}, {}>,
  res: Response
): Promise<any> => {
  try {
    const { thread_id } = req.params;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.'
      });
    }

    // First check if thread exists and user has permission
    const { data: thread, error: fetchError } = await supabase
      .from('threads')
      .select('is_closed, author_id')
      .eq('id', thread_id)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !thread) {
      return res.status(404).json({
        success: false,
        error: 'Thread not found.'
      });
    }

    // Check if user is the author (optional - remove if any user can toggle)
    if (thread.author_id !== user_id) {
      return res.status(403).json({
        success: false,
        error: 'You can only toggle status of your own threads.'
      });
    }

    // Toggle the status
    const { data: updatedThread, error: updateError } = await supabase
      .from('threads')
      .update({
        is_closed: !thread.is_closed,
        updated_at: new Date().toISOString()
      })
      .eq('id', thread_id)
      .select('id, is_closed')
      .single();

    if (updateError) {
      return res.status(500).json({
        success: false,
        error: updateError.message
      });
    }

    return res.status(200).json({
      success: true,
      message: `Thread ${updatedThread.is_closed ? 'closed' : 'opened'} successfully.`,
      data: updatedThread
    });

  } catch (error: any) {
    console.error('Unexpected error in toggleThreadStatus:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error while toggling thread status.',
      message: error.message || 'Unexpected failure.'
    });
  }
};

export {
  createThread,
  deleteThread,
  updateThread,
  getThreadDetails,
  getAllThreads,
  updateReaction,
  getThreadsByUserId,
  toggleThreadStatus,
  updateVote,
};

