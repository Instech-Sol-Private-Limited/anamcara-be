import express from 'express';
import {
  createPost,
  getPosts,
  getUserPosts,
  getTrendingPosts,
  addComment,
  getPostComments,
  voteOnPoll,
  getPollResults,
  deletePost,
  updatePost,
  updatePostReaction
} from '../controllers/posts.controller';
import {
  createComment,
  deleteComment,
  getComments,
  updateComment,
  updateCommentReaction,
} from '../controllers/threads/comments.controller';
import {
  createReply,
  deleteReply,
  getReplies,
  updateReply,
  updateReplyReaction,
} from '../controllers/threads/replies.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';

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
// router.get('/:postId', authMiddleware, async (req, res, next) => {
//   try {
//     await getPost(req, res);
//   } catch (err) {
//     next(err);
//   }
// });

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
// router.post('/:postId/like', authMiddleware, async (req, res, next) => {
//   try {
//     await togglePostLike(req, res);
//   } catch (err) {
//     next(err);
//   }
// });

// Add comment to post
// router.post('/:postId/comments', authMiddleware, async (req, res, next) => {
//   try {
//     await addComment(req, res);
//   } catch (err) {
//     next(err);
//   }
// });

// Get post comments
// router.get('/:postId/comments', authMiddleware, async (req, res, next) => {
//   try {
//     await getPostComments(req, res);
//   } catch (err) {
//     next(err);
//   }
// });

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

router.patch('/apply-react/:postId', authMiddleware, updatePostReaction);
// // ========== Post Comments ==========
router.post('/:postId/comments', optionalAuthMiddleware,createComment);
router.get('/comments', optionalAuthMiddleware, getComments);
router.put('/comments/:comment_id', optionalAuthMiddleware, updateComment);
router.delete('/comments/:comment_id', optionalAuthMiddleware, deleteComment);
router.patch('/comments/:comment_id/apply-react', authMiddleware, updateCommentReaction);

// ========== Comment Replies ==========
router.get('/comments/:comment_id/replies', optionalAuthMiddleware, getReplies);
router.post('/comments/:comment_id/replies', authMiddleware, createReply);
router.put('/replies/:reply_id', authMiddleware, updateReply);
router.delete('/replies/:reply_id', authMiddleware, deleteReply);
router.patch('/replies/:reply_id/apply-react', authMiddleware, updateReplyReaction);

export default router;