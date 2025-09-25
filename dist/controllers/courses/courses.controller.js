"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCourse = exports.createCourse = exports.updateCourseStatus = exports.deleteCourse = exports.getCoursesByInstructor = exports.getFeaturedReviews = exports.getCoursesByCategory = exports.searchCourses = exports.getPlatformStats = exports.getCourseCategories = exports.getCourseById = exports.getFeaturedCourses = exports.getAllCourses = void 0;
const app_1 = require("../../app");
const INSTRUCTOR_SELECT = `
  id,
  first_name,
  last_name,
  avatar_url,
  email,
  bio,
  expertise,
  title,
  company,
  website_url,
  linkedin_url,
  years_experience
`;
// GET /api/courses - Get all courses with filters and pagination
const getAllCourses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page = 1, limit = 12, category, difficulty, price_min, price_max, search, sort = 'newest', featured } = req.query;
        console.log(req.query);
        // For rating and popular sorts, we need to fetch all data first
        const needsClientSorting = sort === 'rating' || sort === 'popular';
        let query = app_1.supabase
            .from('courses')
            .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (${INSTRUCTOR_SELECT}),
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
        // Apply database sorting for simple sorts (not rating/popular)
        if (!needsClientSorting) {
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
                default:
                    query = query.order('created_at', { ascending: false });
            }
            // Apply pagination for database-sorted queries
            const offset = (Number(page) - 1) * Number(limit);
            query = query.range(offset, offset + Number(limit) - 1);
        }
        const { data, error, count } = yield query;
        if (error)
            throw error;
        let sortedData = data;
        let paginatedData = data;
        // Handle client-side sorting for rating and popular
        if (needsClientSorting && data) {
            if (sort === 'rating') {
                sortedData = [...data].sort((a, b) => {
                    var _a, _b;
                    const aRating = ((_a = a.stats) === null || _a === void 0 ? void 0 : _a.average_rating) || 0;
                    const bRating = ((_b = b.stats) === null || _b === void 0 ? void 0 : _b.average_rating) || 0;
                    return bRating - aRating;
                });
            }
            else if (sort === 'popular') {
                sortedData = [...data].sort((a, b) => {
                    var _a, _b;
                    const aEnrollments = ((_a = a.stats) === null || _a === void 0 ? void 0 : _a.total_enrollments) || 0;
                    const bEnrollments = ((_b = b.stats) === null || _b === void 0 ? void 0 : _b.total_enrollments) || 0;
                    return bEnrollments - aEnrollments;
                });
            }
            // Apply pagination AFTER sorting
            const offset = (Number(page) - 1) * Number(limit);
            paginatedData = sortedData.slice(offset, offset + Number(limit));
        }
        else {
            paginatedData = sortedData;
        }
        const totalPages = Math.ceil((count || 0) / Number(limit));
        res.json({
            success: true,
            data: paginatedData,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count || 0,
                totalPages
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch courses'
        });
    }
});
exports.getAllCourses = getAllCourses;
// GET /api/courses/featured - Get featured courses
const getFeaturedCourses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { limit = 6 } = req.query;
        const { data, error } = yield app_1.supabase
            .from('courses')
            .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (${INSTRUCTOR_SELECT}),
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
        if (error)
            throw error;
        res.json({
            success: true,
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch featured courses'
        });
    }
});
exports.getFeaturedCourses = getFeaturedCourses;
// GET /api/courses/:id - Get course by ID
const getCourseById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { data, error } = yield app_1.supabase
            .from('courses')
            .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (${INSTRUCTOR_SELECT}),
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
  content_url,
  content_text,
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
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch course details'
        });
    }
});
exports.getCourseById = getCourseById;
// GET /api/courses/categories - Get all course categories
const getCourseCategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield app_1.supabase
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
        if (error)
            throw error;
        // Transform data to include course counts
        const categoriesWithCounts = (data === null || data === void 0 ? void 0 : data.map(category => {
            var _a;
            return (Object.assign(Object.assign({}, category), { course_count: ((_a = category.courses) === null || _a === void 0 ? void 0 : _a.length) || 0, courses: undefined // Remove the courses array
             }));
        })) || [];
        res.json({
            success: true,
            data: categoriesWithCounts
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch course categories'
        });
    }
});
exports.getCourseCategories = getCourseCategories;
// GET /api/courses/platform-stats - Get platform statistics
const getPlatformStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Get total unique learners
        const { data: learnersData, error: learnersError } = yield app_1.supabase
            .rpc('get_unique_learners_count');
        if (learnersError)
            throw learnersError;
        // Get total published courses
        const { count: coursesCount, error: coursesError } = yield app_1.supabase
            .from('courses')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'published');
        if (coursesError)
            throw coursesError;
        // Get total unique instructors
        const { data: instructorsData, error: instructorsError } = yield app_1.supabase
            .rpc('get_unique_instructors_count');
        if (instructorsError)
            throw instructorsError;
        // Get overall completion rate
        const { data: completionData, error: completionError } = yield app_1.supabase
            .rpc('get_overall_completion_rate');
        if (completionError)
            throw completionError;
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
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch platform statistics'
        });
    }
});
exports.getPlatformStats = getPlatformStats;
// GET /api/courses/search - Search courses
const searchCourses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { q: query, page = 1, limit = 12, category, difficulty, price_min, price_max } = req.query;
        if (!query || typeof query !== 'string' || query.trim().length < 2) {
            res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters long'
            });
            return;
        }
        let supabaseQuery = app_1.supabase
            .from('courses')
            .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (${INSTRUCTOR_SELECT}),
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
        const { data, error, count } = yield supabaseQuery;
        if (error)
            throw error;
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
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Search failed'
        });
    }
});
exports.searchCourses = searchCourses;
// GET /api/courses/category/:categoryId - Get courses by category
const getCoursesByCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { categoryId } = req.params;
        const { page = 1, limit = 12, sort = 'newest' } = req.query;
        let query = app_1.supabase
            .from('courses')
            .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (${INSTRUCTOR_SELECT}),
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
                // Order by created_at first, then we'll sort by rating in the application
                query = query.order('created_at', { ascending: false });
                break;
            case 'popular':
                // Order by created_at first, then we'll sort by enrollment count in the application
                query = query.order('created_at', { ascending: false });
                break;
            default:
                query = query.order('created_at', { ascending: false });
        }
        // Apply pagination
        const offset = (Number(page) - 1) * Number(limit);
        query = query.range(offset, offset + Number(limit) - 1);
        const { data, error, count } = yield query;
        if (error)
            throw error;
        // Apply client-side sorting for rating and popular if needed
        let sortedData = data;
        if (sort === 'rating' && data) {
            sortedData = [...data].sort((a, b) => {
                var _a, _b;
                const aRating = ((_a = a.stats) === null || _a === void 0 ? void 0 : _a.average_rating) || 0;
                const bRating = ((_b = b.stats) === null || _b === void 0 ? void 0 : _b.average_rating) || 0;
                return bRating - aRating;
            });
        }
        else if (sort === 'popular' && data) {
            sortedData = [...data].sort((a, b) => {
                var _a, _b;
                const aEnrollments = ((_a = a.stats) === null || _a === void 0 ? void 0 : _a.total_enrollments) || 0;
                const bEnrollments = ((_b = b.stats) === null || _b === void 0 ? void 0 : _b.total_enrollments) || 0;
                return bEnrollments - aEnrollments;
            });
        }
        if (error)
            throw error;
        const totalPages = Math.ceil((count || 0) / Number(limit));
        res.json({
            success: true,
            data: sortedData,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count || 0,
                totalPages
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch courses by category'
        });
    }
});
exports.getCoursesByCategory = getCoursesByCategory;
const getFeaturedReviews = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { limit = 6 } = req.query;
        const { data, error } = yield app_1.supabase
            .from('course_reviews')
            .select(`
        *,
        user:profiles!course_reviews_user_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url
        ),
        course:courses!course_reviews_course_id_fkey (
          id,
          title,
          category:course_categories!courses_category_id_fkey (
            name
          )
        ),
        enrollment:course_enrollments!course_reviews_enrollment_id_fkey (
          enrolled_at,
          completed_at
        )
      `)
            .eq('is_published', true)
            .gte('rating', 4) // Only high ratings (4-5 stars)
            .not('review_text', 'is', null)
            .order('helpful_count', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(Number(limit));
        if (error)
            throw error;
        // Transform reviews into success story format
        const successStories = (data === null || data === void 0 ? void 0 : data.map(review => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
            return ({
                id: review.id,
                name: `${((_a = review.user) === null || _a === void 0 ? void 0 : _a.first_name) || 'Anonymous'} ${((_b = review.user) === null || _b === void 0 ? void 0 : _b.last_name) || 'User'}`,
                current_role: getJobTitleByCategory(((_d = (_c = review.course) === null || _c === void 0 ? void 0 : _c.category) === null || _d === void 0 ? void 0 : _d.name) || 'Developer'),
                learning_path: ((_f = (_e = review.course) === null || _e === void 0 ? void 0 : _e.category) === null || _f === void 0 ? void 0 : _f.name) || 'General',
                current_salary: getSalaryByCategory(((_h = (_g = review.course) === null || _g === void 0 ? void 0 : _g.category) === null || _h === void 0 ? void 0 : _h.name) || 'General'),
                completion_time: calculateCompletionTime((_j = review.enrollment) === null || _j === void 0 ? void 0 : _j.enrolled_at, (_k = review.enrollment) === null || _k === void 0 ? void 0 : _k.completed_at),
                testimonial: review.review_text,
                rating: review.rating,
                image_url: ((_l = review.user) === null || _l === void 0 ? void 0 : _l.avatar_url) || `https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=150`,
                course_title: ((_m = review.course) === null || _m === void 0 ? void 0 : _m.title) || 'Course'
            });
        })) || [];
        res.json({
            success: true,
            data: successStories
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch featured reviews'
        });
    }
});
exports.getFeaturedReviews = getFeaturedReviews;
// Helper functions for the backend
const getJobTitleByCategory = (categoryName) => {
    const name = categoryName.toLowerCase();
    if (name.includes('web'))
        return 'Senior Full Stack Developer';
    if (name.includes('data'))
        return 'Lead Data Scientist';
    if (name.includes('mobile'))
        return 'Mobile App Developer';
    if (name.includes('design'))
        return 'Senior UX Designer';
    if (name.includes('marketing'))
        return 'Digital Marketing Manager';
    if (name.includes('ai'))
        return 'AI Engineer';
    if (name.includes('cloud'))
        return 'Cloud Solutions Architect';
    return 'Software Developer';
};
const getSalaryByCategory = (categoryName) => {
    const name = categoryName.toLowerCase();
    if (name.includes('web'))
        return '$85K-$150K';
    if (name.includes('data'))
        return '$95K-$180K';
    if (name.includes('mobile'))
        return '$80K-$140K';
    if (name.includes('design'))
        return '$65K-$120K';
    if (name.includes('marketing'))
        return '$55K-$100K';
    if (name.includes('ai') || name.includes('machine'))
        return '$120K-$200K';
    if (name.includes('cloud'))
        return '$100K-$170K';
    return '$70K-$130K';
};
const calculateCompletionTime = (enrolledAt, completedAt) => {
    if (!enrolledAt || !completedAt)
        return '6 months';
    const enrolled = new Date(enrolledAt);
    const completed = new Date(completedAt);
    const diffMonths = Math.ceil((completed.getTime() - enrolled.getTime()) / (1000 * 60 * 60 * 24 * 30));
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''}`;
};
// GET /api/courses/instructor/:instructorId - Get courses by instructor
const getCoursesByInstructor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { instructorId } = req.params;
        const { page = 1, limit = 12, status = 'all', sort = 'created_at' } = req.query;
        let query = app_1.supabase
            .from('courses')
            .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (${INSTRUCTOR_SELECT}),
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
            .eq('instructor_id', instructorId);
        // Filter by status if not 'all'
        if (status !== 'all') {
            query = query.eq('status', status);
        }
        // Apply sorting
        switch (sort) {
            case 'title':
                query = query.order('title', { ascending: true });
                break;
            case 'created_at':
                query = query.order('created_at', { ascending: false });
                break;
            case 'enrollment_count':
                query = query.order('created_at', { ascending: false }); // We'll sort by enrollments client-side
                break;
            default:
                query = query.order('created_at', { ascending: false });
        }
        const { data, error, count } = yield query;
        if (error)
            throw error;
        // Client-side sorting for enrollment count
        let sortedData = data;
        if (sort === 'enrollment_count' && data) {
            sortedData = [...data].sort((a, b) => {
                var _a, _b;
                const aEnrollments = ((_a = a.stats) === null || _a === void 0 ? void 0 : _a.total_enrollments) || 0;
                const bEnrollments = ((_b = b.stats) === null || _b === void 0 ? void 0 : _b.total_enrollments) || 0;
                return bEnrollments - aEnrollments;
            });
        }
        // Add enrollment_count and rating to each course for frontend compatibility
        const coursesWithStats = (sortedData === null || sortedData === void 0 ? void 0 : sortedData.map(course => {
            var _a, _b;
            return (Object.assign(Object.assign({}, course), { enrollment_count: ((_a = course.stats) === null || _a === void 0 ? void 0 : _a.total_enrollments) || 0, rating: ((_b = course.stats) === null || _b === void 0 ? void 0 : _b.average_rating) || 0 }));
        })) || [];
        const totalPages = Math.ceil((count || 0) / Number(limit));
        res.json({
            success: true,
            data: coursesWithStats,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count || 0,
                totalPages
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch instructor courses'
        });
    }
});
exports.getCoursesByInstructor = getCoursesByInstructor;
// DELETE /api/courses/:id - Delete course
const deleteCourse = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { instructorId } = req.body; // Pass instructor ID for authorization
        // First check if course exists and belongs to instructor
        const { data: course, error: fetchError } = yield app_1.supabase
            .from('courses')
            .select('id, instructor_id, status')
            .eq('id', id)
            .single();
        if (fetchError || !course) {
            res.status(404).json({
                success: false,
                message: 'Course not found'
            });
            return;
        }
        // Check if instructor owns this course
        if (course.instructor_id !== instructorId) {
            res.status(403).json({
                success: false,
                message: 'Unauthorized to delete this course'
            });
            return;
        }
        // Check if course has enrollments
        const { data: enrollments, error: enrollError } = yield app_1.supabase
            .from('course_enrollments')
            .select('id')
            .eq('course_id', id)
            .limit(1);
        if (enrollError)
            throw enrollError;
        if (enrollments && enrollments.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Cannot delete course with active enrollments. Archive it instead.'
            });
            return;
        }
        // Delete course (this will cascade delete related data)
        const { error: deleteError } = yield app_1.supabase
            .from('courses')
            .delete()
            .eq('id', id);
        if (deleteError)
            throw deleteError;
        res.json({
            success: true,
            message: 'Course deleted successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete course'
        });
    }
});
exports.deleteCourse = deleteCourse;
// PATCH /api/courses/:id/status - Update course status
const updateCourseStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status, instructorId } = req.body;
        // Validate status
        const validStatuses = ['draft', 'published', 'archived'];
        if (!validStatuses.includes(status)) {
            res.status(400).json({
                success: false,
                message: 'Invalid status. Must be draft, published, or archived'
            });
            return;
        }
        // Check if course exists and belongs to instructor
        const { data: course, error: fetchError } = yield app_1.supabase
            .from('courses')
            .select('id, instructor_id, status')
            .eq('id', id)
            .single();
        if (fetchError || !course) {
            res.status(404).json({
                success: false,
                message: 'Course not found'
            });
            return;
        }
        if (course.instructor_id !== instructorId) {
            res.status(403).json({
                success: false,
                message: 'Unauthorized to update this course'
            });
            return;
        }
        // Update course status
        const { data, error } = yield app_1.supabase
            .from('courses')
            .update({
            status,
            updated_at: new Date().toISOString()
        })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        res.json({
            success: true,
            data,
            message: 'Course status updated successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update course status'
        });
    }
});
exports.updateCourseStatus = updateCourseStatus;
// POST /api/courses - Create new course
const createCourse = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { title, short_description, description, category_id, difficulty, price, instructor_id, duration_hours, thumbnail_url, language = 'English', requirements = [], what_you_will_learn = [], status = 'draft' } = req.body;
        // Validate required fields
        if (!title || !short_description || !description || !category_id || !difficulty || !instructor_id) {
            res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
            return;
        }
        // Create course
        const { data, error } = yield app_1.supabase
            .from('courses')
            .insert({
            title,
            short_description,
            description,
            category_id,
            difficulty,
            price: price || 0,
            instructor_id,
            duration_hours: duration_hours || 0,
            thumbnail_url,
            language,
            requirements,
            what_you_will_learn,
            status,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (${INSTRUCTOR_SELECT}),
        category:course_categories!courses_category_id_fkey (
          id,
          name,
          slug,
          color,
          icon_url
        )
      `)
            .single();
        if (error)
            throw error;
        res.status(201).json({
            success: true,
            data,
            message: 'Course created successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create course'
        });
    }
});
exports.createCourse = createCourse;
// PUT /api/courses/:id - Update course
const updateCourse = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { title, short_description, description, category_id, difficulty, price, instructor_id, duration_hours, thumbnail_url, language, requirements, what_you_will_learn } = req.body;
        // Check if course exists and belongs to instructor
        const { data: course, error: fetchError } = yield app_1.supabase
            .from('courses')
            .select('id, instructor_id')
            .eq('id', id)
            .single();
        if (fetchError || !course) {
            res.status(404).json({
                success: false,
                message: 'Course not found'
            });
            return;
        }
        if (course.instructor_id !== instructor_id) {
            res.status(403).json({
                success: false,
                message: 'Unauthorized to update this course'
            });
            return;
        }
        // Update course
        const { data, error } = yield app_1.supabase
            .from('courses')
            .update({
            title,
            short_description,
            description,
            category_id,
            difficulty,
            price,
            duration_hours,
            thumbnail_url,
            language,
            requirements,
            what_you_will_learn,
            updated_at: new Date().toISOString()
        })
            .eq('id', id)
            .select(`
        *,
        instructor:profiles!courses_instructor_id_fkey (${INSTRUCTOR_SELECT}),
        category:course_categories!courses_category_id_fkey (
          id,
          name,
          slug,
          color,
          icon_url
        )
      `)
            .single();
        if (error)
            throw error;
        res.json({
            success: true,
            data,
            message: 'Course updated successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update course'
        });
    }
});
exports.updateCourse = updateCourse;
