import { Request, Response } from 'express';
import { supabase } from '../app';


export const getAllBlogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const start = (page - 1) * limit;
    
    
    const { data: blogs, error } = await supabase
      .from('blogs')
      .select(`
        *,
        profiles:author_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .order('posted_at', { ascending: false })
      .range(start, start + limit - 1)
      .throwOnError();
    
    if (error) throw error;
    
    const { count: totalCount } = await supabase
      .from('blogs')
      .select('*', { count: 'exact', head: true });
    
    res.status(200).json({
      blogs,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount! / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
};

export const getBlogById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
   
    const { data: blog, error } = await supabase
      .from('blogs')
      .select(`
        *,
        profiles:author_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    if (!blog) {
       res.status(404).json({ error: 'Blog not found' });
    }
    
   
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select(`
        *,
        profiles:user_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('blog_id', id)
      .order('created_at', { ascending: false });
    
    if (commentsError) throw commentsError;
    
    
    const { error: updateError } = await supabase
      .from('blogs')
      .update({ 
        views: (blog.views || 0) + 1 
      })
      .eq('id', id);
    
    if (updateError) {
      console.error('Failed to update view count:', updateError);
    }
    
    res.status(200).json({
      blog,
      comments
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({ error: 'Failed to fetch blog' });
  }
};

export const createBlog = async (req: Request, res: Response): Promise<void>=> {
  try {
    const { title, description, content, image_url } = req.body;
    const userId = req.user!.id; 
    
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
      
    if (profileError) throw profileError;
    
    
    if (userProfile.role !== 'superadmin') {
       res.status(403).json({ error: 'Only admins can create blog posts' });
    }
    
    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required' });
    }
    
    const { data, error } = await supabase
      .from('blogs')
      .insert({
        title,
        description,
        content,
        image_url,
        author_id: userId
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating blog:', error);
    res.status(500).json({ error: 'Failed to create blog' });
  }
};

export const updateBlog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, content, image_url } = req.body;
    const userId = req.user!.id; 
    
   
    const { data: blog, error: fetchError } = await supabase
      .from('blogs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) throw fetchError;
    
    if (!blog) {
       res.status(404).json({ error: 'Blog not found' });
    }
    
    if (blog.author_id !== userId) {
      res.status(403).json({ error: 'Not authorized to update this blog' });
    }
    
   
    const { data, error } = await supabase
      .from('blogs')
      .update({
        title,
        description,
        content,
        image_url,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Error updating blog:', error);
    res.status(500).json({ error: 'Failed to update blog' });
  }
};

export const deleteBlog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id; 
    
   
    const { data: blog, error: fetchError } = await supabase
      .from('blogs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) throw fetchError;
    
    if (!blog) {
      res.status(404).json({ error: 'Blog not found' });
    }
    
    if (blog.author_id !== userId) {
       res.status(403).json({ error: 'Not authorized to delete this blog' });
    }
    
    
    const { error } = await supabase
      .from('blogs')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.status(200).json({ message: 'Blog deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog:', error);
    res.status(500).json({ error: 'Failed to delete blog' });
  }
};

// Like/Unlike blog
export const likeUnlikeBlog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id; // From auth middleware
    
    // Check if already liked (needs a blog_likes table)
    const { data: existingLike, error: likeError } = await supabase
      .from('blog_likes')
      .select('*')
      .eq('blog_id', id)
      .eq('user_id', userId)
      .single();
    
    if (likeError && likeError.code !== 'PGRST116') { // Not found error is OK
      throw likeError;
    }
    
    if (existingLike) {
      // Unlike: Remove the like
      const { error } = await supabase
        .from('blog_likes')
        .delete()
        .eq('blog_id', id)
        .eq('user_id', userId);
      
      if (error) throw error;
      res.status(200).json({ liked: false });
    } else {
      // Like: Add a new like
      const { error } = await supabase
        .from('blog_likes')
        .insert({
          blog_id: id,
          user_id: userId
        });
      
      if (error) throw error;
      res.status(200).json({ liked: true });
    }
  } catch (error) {
    console.error('Error liking/unliking blog:', error);
    res.status(500).json({ error: 'Failed to like/unlike blog' });
  }
};

export const bookmarkUnbookmarkBlog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
   
    const { data: existingBookmark, error: bookmarkError } = await supabase
      .from('blog_bookmarks')
      .select('*')
      .eq('blog_id', id)
      .eq('user_id', userId)
      .single();
    
    if (bookmarkError && bookmarkError.code !== 'PGRST116') { 
      throw bookmarkError;
    }
    
    if (existingBookmark) {
     
      const { error } = await supabase
        .from('blog_bookmarks')
        .delete()
        .eq('blog_id', id)
        .eq('user_id', userId);
      
      if (error) throw error;
      res.status(200).json({ bookmarked: false });
    } else {
      
      const { error } = await supabase
        .from('blog_bookmarks')
        .insert({
          blog_id: id,
          user_id: userId
        });
      
      if (error) throw error;
      res.status(200).json({ bookmarked: true });
    }
  } catch (error) {
    console.error('Error bookmarking/unbookmarking blog:', error);
    res.status(500).json({ error: 'Failed to bookmark/unbookmark blog' });
  }
};

export const addComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user!.id; 
    if (!content) {
      res.status(400).json({ error: 'Comment content is required' });
    }
    
   
    const { data, error } = await supabase
      .from('comments')
      .insert({
        blog_id: id,
        user_id: userId,
        content
      })
      .select(`
        *,
        profiles:user_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .single();
    
    if (error) throw error;
    
    res.status(201).json(data);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
};