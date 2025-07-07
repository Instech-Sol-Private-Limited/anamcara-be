import { Request, Response } from 'express';
import { supabase } from '../../app';

// GET /api/courses - Get all courses with filters and pagination
export const getAllCourses = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      difficulty,
      price_min,
      price_max,
      search,
      sort = 'newest',
      featured
    } = req.query;

    let query = supabase
      .from('courses')
      .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        ),
        category:course_categories!courses_category_id_fkey (
          id,
          name,
          slug,
          color,
          icon_url
        ),
        stats:course_stats!course_stats_course_id_fkey (
          total_enrollments,
          total_completions,
          average_rating,
          total_reviews,
          completion_rate
        )
      `, { count: 'exact' })
      .eq('status', 'published');

    // Apply filters
    if (category) {
      query = query.eq('category_id', category);
    }
    if (difficulty) {
      query = query.eq('difficulty', difficulty);
    }
    if (price_min) {
      query = query.gte('price', price_min);
    }
    if (price_max) {
      query = query.lte('price', price_max);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,short_description.ilike.%${search}%`);
    }
    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }

    // Apply sorting
    switch (sort) {
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'price_low':
        query = query.order('price', { ascending: true });
        break;
      case 'price_high':
        query = query.order('price', { ascending: false });
        break;
      case 'rating':
        query = query.order('average_rating', { ascending: false, nullsFirst: false });
        break;
      case 'popular':
        query = query.order('total_enrollments', { ascending: false, nullsFirst: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    // Apply pagination
    const offset = (Number(page) - 1) * Number(limit);
    query = query.range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    const totalPages = Math.ceil((count || 0) / Number(limit));

    res.json({
      success: true,
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        totalPages
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch courses'
    });
  }
};

// GET /api/courses/featured - Get featured courses
export const getFeaturedCourses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 6 } = req.query;

    const { data, error } = await supabase
      .from('courses')
      .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        ),
        category:course_categories!courses_category_id_fkey (
          id,
          name,
          slug,
          color,
          icon_url
        ),
        stats:course_stats!course_stats_course_id_fkey (
          total_enrollments,
          total_completions,
          average_rating,
          total_reviews,
          completion_rate
        )
      `)
      .eq('status', 'published')
      .eq('is_featured', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch featured courses'
    });
  }
};

// GET /api/courses/:id - Get course by ID
export const getCourseById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('courses')
      .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        ),
        category:course_categories!courses_category_id_fkey (
          id,
          name,
          slug,
          color,
          icon_url
        ),
        stats:course_stats!course_stats_course_id_fkey (
          total_enrollments,
          total_completions,
          average_rating,
          total_reviews,
          completion_rate
        ),
        sections:course_sections!course_sections_course_id_fkey (
          id,
          title,
          description,
          sort_order,
          lessons:course_lessons!course_lessons_section_id_fkey (
            id,
            title,
            description,
            type,
            duration_minutes,
            is_preview,
            sort_order
          )
        )
      `)
      .eq('id', id)
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({
          success: false,
          message: 'Course not found'
        });
        return;
      }
      throw error;
    }

    res.json({
      success: true,
      data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch course details'
    });
  }
};

// GET /api/courses/categories - Get all course categories
export const getCourseCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('course_categories')
      .select(`
        *,
        courses!courses_category_id_fkey (
          id
        )
      `)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;

    // Transform data to include course counts
    const categoriesWithCounts = data?.map(category => ({
      ...category,
      course_count: category.courses?.length || 0,
      courses: undefined // Remove the courses array
    })) || [];

    res.json({
      success: true,
      data: categoriesWithCounts
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch course categories'
    });
  }
};

// GET /api/courses/platform-stats - Get platform statistics
export const getPlatformStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get total unique learners
    const { data: learnersData, error: learnersError } = await supabase
      .rpc('get_unique_learners_count');

    if (learnersError) throw learnersError;

    // Get total published courses
    const { count: coursesCount, error: coursesError } = await supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published');

    if (coursesError) throw coursesError;

    // Get total unique instructors
    const { data: instructorsData, error: instructorsError } = await supabase
      .rpc('get_unique_instructors_count');

    if (instructorsError) throw instructorsError;

    // Get overall completion rate
    const { data: completionData, error: completionError } = await supabase
      .rpc('get_overall_completion_rate');

    if (completionError) throw completionError;

    const stats = {
      total_learners: learnersData || 0,
      total_courses: coursesCount || 0,
      total_instructors: instructorsData || 0,
      success_rate: completionData || 0
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch platform statistics'
    });
  }
};

// GET /api/courses/search - Search courses
export const searchCourses = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      q: query,
      page = 1,
      limit = 12,
      category,
      difficulty,
      price_min,
      price_max
    } = req.query;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
      return;
    }

    let supabaseQuery = supabase
      .from('courses')
      .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        ),
        category:course_categories!courses_category_id_fkey (
          id,
          name,
          slug,
          color,
          icon_url
        ),
        stats:course_stats!course_stats_course_id_fkey (
          total_enrollments,
          total_completions,
          average_rating,
          total_reviews,
          completion_rate
        )
      `, { count: 'exact' })
      .eq('status', 'published')
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,short_description.ilike.%${query}%`);

    // Apply additional filters
    if (category) {
      supabaseQuery = supabaseQuery.eq('category_id', category);
    }
    if (difficulty) {
      supabaseQuery = supabaseQuery.eq('difficulty', difficulty);
    }
    if (price_min) {
      supabaseQuery = supabaseQuery.gte('price', price_min);
    }
    if (price_max) {
      supabaseQuery = supabaseQuery.lte('price', price_max);
    }

    // Apply pagination
    const offset = (Number(page) - 1) * Number(limit);
    supabaseQuery = supabaseQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await supabaseQuery;

    if (error) throw error;

    const totalPages = Math.ceil((count || 0) / Number(limit));

    res.json({
      success: true,
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        totalPages
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Search failed'
    });
  }
};

// GET /api/courses/category/:categoryId - Get courses by category
export const getCoursesByCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId } = req.params;
    const {
      page = 1,
      limit = 12,
      sort = 'newest'
    } = req.query;

    let query = supabase
      .from('courses')
      .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          email
        ),
        category:course_categories!courses_category_id_fkey (
          id,
          name,
          slug,
          color,
          icon_url
        ),
        stats:course_stats!course_stats_course_id_fkey (
          total_enrollments,
          total_completions,
          average_rating,
          total_reviews,
          completion_rate
        )
      `, { count: 'exact' })
      .eq('status', 'published')
      .eq('category_id', categoryId);

    // Apply sorting
    switch (sort) {
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'price_low':
        query = query.order('price', { ascending: true });
        break;
      case 'price_high':
        query = query.order('price', { ascending: false });
        break;
      case 'rating':
        query = query.order('average_rating', { ascending: false, nullsFirst: false });
        break;
      case 'popular':
        query = query.order('total_enrollments', { ascending: false, nullsFirst: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    // Apply pagination
    const offset = (Number(page) - 1) * Number(limit);
    query = query.range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    const totalPages = Math.ceil((count || 0) / Number(limit));

    res.json({
      success: true,
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        totalPages
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch courses by category'
    });
  }
};