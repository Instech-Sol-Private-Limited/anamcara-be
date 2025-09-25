"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/blogRoutes.ts
const express_1 = __importDefault(require("express"));
const blog_controller_1 = require("../controllers/blog.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// ===================== Blogs =======================
// get all blogs
router.get('/', blog_controller_1.getAllBlogs);
// get blog by id
router.get('/:id', blog_controller_1.getBlogById);
// create blog
router.post('/', auth_middleware_1.authMiddleware, blog_controller_1.createBlog);
// update blog
router.put('/:id', auth_middleware_1.authMiddleware, blog_controller_1.updateBlog);
// delete blog
router.delete('/:id', auth_middleware_1.authMiddleware, blog_controller_1.deleteBlog);
// ===================== comments =======================
// create comment
router.post('/add-comment', auth_middleware_1.authMiddleware, blog_controller_1.addComment);
// update comment
router.put('/update-comment/:comment_id', auth_middleware_1.authMiddleware, blog_controller_1.updateComment);
// delete comment
router.delete('/delete-comment/:comment_id', auth_middleware_1.authMiddleware, blog_controller_1.deleteComment);
// delete comment
router.get('/get-comments/:blog_id', auth_middleware_1.authMiddleware, blog_controller_1.getCommentsByBlogId);
router.post('/:id/like', auth_middleware_1.authMiddleware, blog_controller_1.likeUnlikeBlog);
router.post('/:id/bookmark', auth_middleware_1.authMiddleware, blog_controller_1.bookmarkUnbookmarkBlog);
exports.default = router;
