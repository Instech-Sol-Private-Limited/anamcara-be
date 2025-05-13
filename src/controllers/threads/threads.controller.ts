import { Request, Response } from 'express';
import { supabase } from '../../app';

// add new thread
const createThread = async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      title,
      description,
      imgs = [],
      category_id,
      keywords = []
    } = req.body;

    const { id: author_id, first_name, last_name } = req.user!;

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
        keywords
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
      .delete()
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
      keywords = []
    } = req.body;

    const { id: author_id, first_name, last_name, role } = req.user!;

    const { data: existingThread, error: threadError } = await supabase
      .from('threads')
      .select('*')
      .eq('id', thread_id)
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
        keywords
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

    const { data: thread, error } = await supabase
      .from('threads')
      .select(`
        *,
        profiles!inner(avatar_url)  -- Perform inner join with the profiles table
      `)
      .eq('id', thread_id)
      .maybeSingle();

    if (error || !thread) {
      return res.status(404).json({ error: 'Thread not found!' });
    }

    let userReaction = null;
    if (user_id) {
      const { data: reactionData, error: reactionError } = await supabase
        .from('thread_likes')
        .select('reaction')
        .eq('user_id', user_id)
        .eq('thread_id', thread_id)
        .maybeSingle();

      if (!reactionError && reactionData) {
        userReaction = reactionData.reaction;
      }
    }

    return res.json({ thread, userReaction });
  } catch (err) {
    return res.status(500).json({ error: 'Something went wrong!' });
  }
};

// get all threads
const getAllThreads = async (req: Request, res: Response): Promise<any> => {
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;

  const { data, error } = await supabase
    .from('threads')
    .select(`
      *,
      profiles!inner(avatar_url)  -- Perform inner join with the profiles table
    `)
    .eq('is_active', true) // Optional condition for active threads
    .order('publish_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  return res.json(data);
};

// apply like/dislike
const updateReaction = async (
  req: Request<{ thread_id: string }, {}, { type: 'like' | 'dislike' }>,
  res: Response
): Promise<any> => {
  const { thread_id } = req.params;
  const { type } = req.body;

  const user_id = req.user?.id;

  const { data: existing, error: fetchError } = await supabase
    .from('thread_likes')
    .select('*')
    .eq('user_id', user_id)
    .eq('thread_id', thread_id)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    return res.status(500).json({ error: fetchError.message });
  }

  const { data: threadData, error: threadError } = await supabase
    .from('threads')
    .select('total_likes, total_dislikes')
    .eq('id', thread_id)
    .single();

  if (threadError) {
    return res.status(500).json({ error: threadError.message });
  }

  let newTotalLikes = threadData?.total_likes ?? 0;
  let newTotalDislikes = threadData?.total_dislikes ?? 0;

  if (existing) {
    if (existing.type === 'like' && type === 'like') {
      newTotalLikes -= 1;
      const { error: deleteError } = await supabase
        .from('thread_likes')
        .delete()
        .eq('user_id', user_id)
        .eq('thread_id', thread_id);

      if (deleteError) return res.status(500).json({ error: deleteError.message });

      // Update total_likes in the thread
      const { error: updateLikesError } = await supabase
        .from('threads')
        .update({ total_likes: newTotalLikes })
        .eq('id', thread_id);

      if (updateLikesError) return res.status(500).json({ error: updateLikesError.message });

      return res.status(200).json({ message: 'Like removed.' });
    }

    if (existing.type === 'dislike' && type === 'dislike') {
      newTotalDislikes -= 1;
      const { error: deleteError } = await supabase
        .from('thread_likes')
        .delete()
        .eq('user_id', user_id)
        .eq('thread_id', thread_id);

      if (deleteError) return res.status(500).json({ error: deleteError.message });

      // Update total_dislikes in the thread
      const { error: updateDislikesError } = await supabase
        .from('threads')
        .update({ total_dislikes: newTotalDislikes })
        .eq('id', thread_id);

      if (updateDislikesError) return res.status(500).json({ error: updateDislikesError.message });

      return res.status(200).json({ message: 'Dislike removed.' });
    }

    if (existing.type === 'like' && type === 'dislike') {
      newTotalLikes -= 1;
      newTotalDislikes += 1;

      // Remove the old like
      const { error: deleteLikeError } = await supabase
        .from('thread_likes')
        .delete()
        .eq('user_id', user_id)
        .eq('thread_id', thread_id);

      if (deleteLikeError) return res.status(500).json({ error: deleteLikeError.message });

      // Insert the new dislike
      const { error: insertDislikeError } = await supabase
        .from('thread_likes')
        .insert([{ user_id, thread_id, type: 'dislike' }]);

      if (insertDislikeError) return res.status(500).json({ error: insertDislikeError.message });

      // Update totals
      const { error: updateTotalsError } = await supabase
        .from('threads')
        .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
        .eq('id', thread_id);

      if (updateTotalsError) return res.status(500).json({ error: updateTotalsError.message });

      return res.status(200).json({ message: 'Like changed to dislike.' });
    }

    if (existing.type === 'dislike' && type === 'like') {
      newTotalLikes += 1;
      newTotalDislikes -= 1;

      // Remove the old dislike
      const { error: deleteDislikeError } = await supabase
        .from('thread_likes')
        .delete()
        .eq('user_id', user_id)
        .eq('thread_id', thread_id);

      if (deleteDislikeError) return res.status(500).json({ error: deleteDislikeError.message });

      // Insert the new like
      const { error: insertLikeError } = await supabase
        .from('thread_likes')
        .insert([{ user_id, thread_id, type: 'like' }]);

      if (insertLikeError) return res.status(500).json({ error: insertLikeError.message });

      // Update totals
      const { error: updateTotalsError } = await supabase
        .from('threads')
        .update({ total_likes: newTotalLikes, total_dislikes: newTotalDislikes })
        .eq('id', thread_id);

      if (updateTotalsError) return res.status(500).json({ error: updateTotalsError.message });

      return res.status(200).json({ message: 'Dislike changed to like.' });
    }
  } else {
    if (type === 'like') {
      newTotalLikes += 1;
      const { error: insertLikeError } = await supabase
        .from('thread_likes')
        .insert([{ user_id, thread_id, type }]);

      if (insertLikeError) return res.status(500).json({ error: insertLikeError.message });

      const { error: updateLikesError } = await supabase
        .from('threads')
        .update({ total_likes: newTotalLikes })
        .eq('id', thread_id);

      if (updateLikesError) return res.status(500).json({ error: updateLikesError.message });

      return res.status(200).json({ message: 'Like added.' });
    }

    if (type === 'dislike') {
      newTotalDislikes += 1;
      const { error: insertDislikeError } = await supabase
        .from('thread_likes')
        .insert([{ user_id, thread_id, type }]);

      if (insertDislikeError) return res.status(500).json({ error: insertDislikeError.message });

      const { error: updateDislikesError } = await supabase
        .from('threads')
        .update({ total_dislikes: newTotalDislikes })
        .eq('id', thread_id);

      if (updateDislikesError) return res.status(500).json({ error: updateDislikesError.message });

      return res.status(200).json({ message: 'Dislike added.' });
    }
  }
};

// get user reaction by thread
const getThreadReaction = async (req: Request<{ thread_id: string }>, res: Response): Promise<any> => {
  const { thread_id } = req.params;
  const user_id = req.user?.id;

  if (!thread_id || !user_id) {
    return res.status(400).json({ error: 'Thread ID and User ID are required.' });
  }

  const { data, error } = await supabase
    .from('thread_likes')
    .select('type')
    .eq('user_id', user_id)
    .eq('thread_id', thread_id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(200).json({ message: 'No reaction found.', reaction: null });
  }
  return res.status(200).json({
    thread_id,
    reaction: data?.type || null,
  });
};

// get all thread user reaction
const getAllReactionsByUser = async (req: Request, res: Response): Promise<any> => {
  const user_id = req.user?.id;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;

  const { data, error } = await supabase
    .from('thread_likes')
    .select('thread_id, reaction')
    .eq('user_id', user_id)
    .range(offset, offset + limit - 1);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    reactions: data || [],
    pagination: {
      limit,
      offset,
      count: data?.length || 0,
    },
  });
};

export {
  createThread,
  deleteThread,
  updateThread,
  getThreadDetails,
  getAllThreads,
  updateReaction,
  getThreadReaction,
  getAllReactionsByUser
};

