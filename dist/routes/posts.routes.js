"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const posts_controller_1 = require("../controllers/posts.controller");
const comments_controller_1 = require("../controllers/threads/comments.controller");
const replies_controller_1 = require("../controllers/threads/replies.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.post('/', auth_middleware_1.authMiddleware, posts_controller_1.createPost);
router.get('/', auth_middleware_1.optionalAuthMiddleware, posts_controller_1.getPosts);
router.get('/trending', auth_middleware_1.authMiddleware, posts_controller_1.getTrendingPosts);
router.get('/user/:userId', auth_middleware_1.optionalAuthMiddleware, posts_controller_1.getUserPosts);
router.get('/user-media/:userId', posts_controller_1.getUserPostsMedia);
router.put('/:postId', auth_middleware_1.authMiddleware, posts_controller_1.updatePost);
router.delete('/:postId', auth_middleware_1.authMiddleware, posts_controller_1.deletePost);
router.post('/:postId/vote', auth_middleware_1.authMiddleware, posts_controller_1.voteOnPoll);
router.get('/:postId/results', auth_middleware_1.optionalAuthMiddleware, posts_controller_1.getPollResults);
router.patch('/apply-react/:postId', auth_middleware_1.authMiddleware, posts_controller_1.updatePostReaction);
router.post('/votes/:targetId', auth_middleware_1.authMiddleware, posts_controller_1.updateVote);
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
router.post('/:postId/comments', auth_middleware_1.optionalAuthMiddleware, comments_controller_1.createComment);
router.get('/comments', auth_middleware_1.optionalAuthMiddleware, comments_controller_1.getComments);
router.put('/comments/:comment_id', auth_middleware_1.optionalAuthMiddleware, comments_controller_1.updateComment);
router.delete('/comments/:comment_id', auth_middleware_1.optionalAuthMiddleware, comments_controller_1.deleteComment);
router.patch('/comments/:comment_id/apply-react', auth_middleware_1.authMiddleware, comments_controller_1.updateCommentReaction);
// ========== Comment Replies ==========
router.get('/comments/:comment_id/replies', auth_middleware_1.optionalAuthMiddleware, replies_controller_1.getReplies);
router.post('/comments/:comment_id/replies', auth_middleware_1.authMiddleware, replies_controller_1.createReply);
router.put('/replies/:reply_id', auth_middleware_1.authMiddleware, replies_controller_1.updateReply);
router.delete('/replies/:reply_id', auth_middleware_1.authMiddleware, replies_controller_1.deleteReply);
router.patch('/replies/:reply_id/apply-react', auth_middleware_1.authMiddleware, replies_controller_1.updateReplyReaction);
exports.default = router;
