import express from 'express';
import {
  getAllCourses,
  getFeaturedCourses,
  getCourseCategories,
  getPlatformStats,
  searchCourses,
  getCoursesByCategory,
  getCourseById,
  getFeaturedReviews
} from '../controllers/courses/courses.controller';

const router = express.Router();

// Course routes
router.get('/', getAllCourses);                        // GET /api/courses
router.get('/featured', getFeaturedCourses);           // GET /api/courses/featured
router.get('/categories', getCourseCategories);        // GET /api/courses/categories
router.get('/platform-stats', getPlatformStats);      // GET /api/courses/platform-stats
router.get('/search', searchCourses);                 // GET /api/courses/search
router.get('/reviews/featured', getFeaturedReviews);  // GET /api/courses/reviews/featured
router.get('/category/:categoryId', getCoursesByCategory); // GET /api/courses/category/:categoryId
router.get('/:id', getCourseById);  
export default router;