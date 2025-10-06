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
  updatePostReaction,
  getUserPostsMedia,
  updateVote
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

router.post('/', authMiddleware, createPost);

router.get('/', optionalAuthMiddleware, getPosts);

router.get('/trending', authMiddleware, getTrendingPosts);

router.get('/user/:userId', authMiddleware, getUserPosts);

router.get('/user-media/:userId', authMiddleware, getUserPostsMedia);

router.put('/:postId', authMiddleware, updatePost);

router.delete('/:postId', authMiddleware, deletePost);

router.post('/:postId/vote', authMiddleware, voteOnPoll);

router.get('/:postId/results', authMiddleware, getPollResults);

router.patch('/apply-react/:postId', authMiddleware, updatePostReaction);

router.post('/votes/:targetId', authMiddleware, updateVote);

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



// // ========== Post Comments ==========
router.post('/:postId/comments', optionalAuthMiddleware, createComment);

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