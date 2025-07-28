"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const courses_controller_1 = require("../controllers/courses/courses.controller");
const router = express_1.default.Router();
// Course CRUD routes
router.post('/', courses_controller_1.createCourse); // POST /api/courses - Create course
router.put('/:id', courses_controller_1.updateCourse); // PUT /api/courses/:id - Update course
router.delete('/:id', courses_controller_1.deleteCourse); // DELETE /api/courses/:id - Delete course
router.patch('/:id/status', courses_controller_1.updateCourseStatus); // PATCH /api/courses/:id/status - Update status
// Course query routes
router.get('/', courses_controller_1.getAllCourses); // GET /api/courses
router.get('/featured', courses_controller_1.getFeaturedCourses); // GET /api/courses/featured
router.get('/categories', courses_controller_1.getCourseCategories); // GET /api/courses/categories
router.get('/platform-stats', courses_controller_1.getPlatformStats); // GET /api/courses/platform-stats
router.get('/search', courses_controller_1.searchCourses); // GET /api/courses/search
router.get('/reviews/featured', courses_controller_1.getFeaturedReviews); // GET /api/courses/reviews/featured
router.get('/instructor/:instructorId', courses_controller_1.getCoursesByInstructor); // GET /api/courses/instructor/:instructorId
router.get('/category/:categoryId', courses_controller_1.getCoursesByCategory); // GET /api/courses/category/:categoryId
router.get('/:id', courses_controller_1.getCourseById); // GET /api/courses/:id
exports.default = router;
