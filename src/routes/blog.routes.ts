// src/routes/blogRoutes.ts
import express from 'express';
import { 
  getAllBlogs, 
  getBlogById, 
  createBlog, 
  updateBlog, 
  deleteBlog,
  likeUnlikeBlog,
  bookmarkUnbookmarkBlog,
  addComment,
  updateComment,
  deleteComment,
  getCommentsByBlogId
} from '../controllers/blog.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// ===================== Blogs =======================

// get all blogs
router.get('/', getAllBlogs);

// get blog by id
router.get('/:id', getBlogById);

// create blog
router.post('/', authMiddleware, createBlog);

// update blog
router.put('/:id', authMiddleware, updateBlog);

// delete blog
router.delete('/:id', authMiddleware, deleteBlog);


// ===================== comments =======================

// create comment
router.post('/add-comment', authMiddleware, addComment);

// update comment
router.put('/update-comment/:comment_id', authMiddleware, updateComment);

// delete comment
router.delete('/delete-comment/:comment_id', authMiddleware, deleteComment);

// delete comment
router.get('/get-comments/:blog_id', authMiddleware, getCommentsByBlogId);


router.post('/:id/like', authMiddleware, likeUnlikeBlog);
router.post('/:id/bookmark', authMiddleware, bookmarkUnbookmarkBlog);

export default router;