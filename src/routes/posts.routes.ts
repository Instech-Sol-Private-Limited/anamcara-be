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
  updateVote,
  getSinglePost
} from '../controllers/posts.controller';
import {
  createComment,
  deleteComment,
  getComments,
  updateComment,
  updateCommentReaction,
  updateCommentsVote,
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

router.get('/get-post/:postId', optionalAuthMiddleware, getSinglePost);

router.get('/trending', authMiddleware, getTrendingPosts);

router.get('/user/:userId', optionalAuthMiddleware, getUserPosts);

router.get('/user-media/:userId', getUserPostsMedia);

router.put('/:postId', authMiddleware, updatePost);

router.delete('/:postId', authMiddleware, deletePost);

router.post('/:postId/vote', authMiddleware, voteOnPoll);

router.get('/:postId/results', optionalAuthMiddleware, getPollResults);

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



// ========== Post Comments ==========
router.get('/get-comments', optionalAuthMiddleware, getComments);

router.post('/:postId/comments', optionalAuthMiddleware, createComment);

router.put('/comments/:comment_id', optionalAuthMiddleware, updateComment);

router.delete('/comments/:comment_id', optionalAuthMiddleware, deleteComment);

router.patch('/comments/:comment_id/apply-react', authMiddleware, updateCommentReaction);

router.post('/comments/:targetId/vote', authMiddleware, updateCommentsVote);



// ========== Comment Replies ==========
router.get('/comments/:comment_id/replies', optionalAuthMiddleware, getReplies);

router.post('/comments/:comment_id/replies', authMiddleware, createReply);

router.put('/replies/:reply_id', authMiddleware, updateReply);

router.delete('/replies/:reply_id', authMiddleware, deleteReply);

router.patch('/replies/:reply_id/apply-react', authMiddleware, updateReplyReaction);

router.post('/subcomments/:targetId/vote', authMiddleware, updateCommentsVote);

export default router;