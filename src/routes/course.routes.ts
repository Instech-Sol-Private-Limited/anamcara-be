import express from 'express';
import {
  getAllCourses,
  getFeaturedCourses,
  getCourseCategories,
  getPlatformStats,
  searchCourses,
  getCoursesByCategory,
  getCourseById,
  getFeaturedReviews,
  // Add these new imports
  getCoursesByInstructor,
  deleteCourse,
  updateCourseStatus,
  createCourse,
  updateCourse
} from '../controllers/courses/courses.controller';

const router = express.Router();

// Course CRUD routes
router.post('/', createCourse);                           // POST /api/courses - Create course
router.put('/:id', updateCourse);                         // PUT /api/courses/:id - Update course
router.delete('/:id', deleteCourse);                      // DELETE /api/courses/:id - Delete course
router.patch('/:id/status', updateCourseStatus);          // PATCH /api/courses/:id/status - Update status

// Course query routes
router.get('/', getAllCourses);                           // GET /api/courses
router.get('/featured', getFeaturedCourses);              // GET /api/courses/featured
router.get('/categories', getCourseCategories);           // GET /api/courses/categories
router.get('/platform-stats', getPlatformStats);         // GET /api/courses/platform-stats
router.get('/search', searchCourses);                    // GET /api/courses/search
router.get('/reviews/featured', getFeaturedReviews);     // GET /api/courses/reviews/featured
router.get('/instructor/:instructorId', getCoursesByInstructor); // GET /api/courses/instructor/:instructorId
router.get('/category/:categoryId', getCoursesByCategory); // GET /api/courses/category/:categoryId
router.get('/:id', getCourseById);                        // GET /api/courses/:id

export default router;