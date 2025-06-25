import express from 'express';
import {
  createPost,
  getPosts,
  getUserPosts,
  getTrendingPosts,
  getPost,
  togglePostLike,
  addComment,
  getPostComments,
  voteOnPoll,
  getPollResults,
  deletePost,
  updatePost
} from '../controllers/posts.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Create a new post
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    await createPost(req, res);
  } catch (err) {
    next(err);
  }
});

// Get all posts with pagination
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    await getPosts(req, res);
  } catch (err) {
    next(err);
  }
});

// Get trending posts
router.get('/trending', authMiddleware, async (req, res, next) => {
  try {
    await getTrendingPosts(req, res);
  } catch (err) {
    next(err);
  }
});

// Get posts by specific user
router.get('/user/:userId', authMiddleware, async (req, res, next) => {
  try {
    await getUserPosts(req, res);
  } catch (err) {
    next(err);
  }
});

// Get single post
router.get('/:postId', authMiddleware, async (req, res, next) => {
  try {
    await getPost(req, res);
  } catch (err) {
    next(err);
  }
});

// Update post
router.put('/:postId', authMiddleware, async (req, res, next) => {
  try {
    await updatePost(req, res);
  } catch (err) {
    next(err);
  }
});

// Delete post (soft delete)
router.delete('/:postId', authMiddleware, async (req, res, next) => {
  try {
    await deletePost(req, res);
  } catch (err) {
    next(err);
  }
});

// Toggle like on post
router.post('/:postId/like', authMiddleware, async (req, res, next) => {
  try {
    await togglePostLike(req, res);
  } catch (err) {
    next(err);
  }
});

// Add comment to post
router.post('/:postId/comments', authMiddleware, async (req, res, next) => {
  try {
    await addComment(req, res);
  } catch (err) {
    next(err);
  }
});

// Get post comments
router.get('/:postId/comments', authMiddleware, async (req, res, next) => {
  try {
    await getPostComments(req, res);
  } catch (err) {
    next(err);
  }
});

// Vote on poll
router.post('/:postId/vote', authMiddleware, async (req, res, next) => {
  try {
    await voteOnPoll(req, res);
  } catch (err) {
    next(err);
  }
});

// Get poll results
router.get('/:postId/results', authMiddleware, async (req, res, next) => {
  try {
    await getPollResults(req, res);
  } catch (err) {
    next(err);
  }
});

export default router;