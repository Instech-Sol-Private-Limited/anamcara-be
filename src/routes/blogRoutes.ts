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
  addComment
} from '../controllers/blogController';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

router.get('/', getAllBlogs);
router.get('/:id', getBlogById);


router.post('/', authMiddleware, createBlog);
router.put('/:id', authMiddleware, updateBlog);
router.delete('/:id', authMiddleware, deleteBlog);


router.post('/:id/like', authMiddleware, likeUnlikeBlog);
router.post('/:id/bookmark', authMiddleware, bookmarkUnbookmarkBlog);
router.post('/:id/comment', authMiddleware, addComment);

export default router;