import express from 'express';
import {
  getAllCourses,
  getFeaturedCourses,
  getCourseCategories,
  getPlatformStats,
  searchCourses,
  getCoursesByCategory,
  getCourseById
} from '../controllers/courses/courses.controller';

const router = express.Router();

// Course routes
router.get('/', getAllCourses);
router.get('/featured', getFeaturedCourses);
router.get('/categories', getCourseCategories);
router.get('/platform-stats', getPlatformStats);
router.get('/search', searchCourses);
router.get('/category/:categoryId', getCoursesByCategory);
router.get('/:id', getCourseById);

export default router;