"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const threads_controller_1 = require("../controllers/threads/threads.controller");
const comments_controller_1 = require("../controllers/threads/comments.controller");
const replies_controller_1 = require("../controllers/threads/replies.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// ======================= threads ========================
// get all threads(range)
router.get('/get-all-threads', auth_middleware_1.optionalAuthMiddleware, threads_controller_1.getAllThreads);
// create a new thread
router.post('/create-thread', auth_middleware_1.authMiddleware, threads_controller_1.createThread);
// get thread details
router.get('/get-thread-details/:thread_id', auth_middleware_1.optionalAuthMiddleware, threads_controller_1.getThreadDetails);
// update thread
router.put('/update-thread/:thread_id', auth_middleware_1.authMiddleware, threads_controller_1.updateThread);
// delete thread
router.delete('/delete-thread/:thread_id', auth_middleware_1.authMiddleware, threads_controller_1.deleteThread);
// handle like/ dislike
router.patch('/apply-react/:thread_id', auth_middleware_1.authMiddleware, threads_controller_1.updateReaction);
router.get('/get-threads-by-user/:user_id', auth_middleware_1.optionalAuthMiddleware, threads_controller_1.getThreadsByUserId);
// get user reaction by thread
// router.get('/get-user-reaction/:thread_id', authMiddleware, getThreadReaction);
// // get all thread user reaction
// router.get('/get-all-user-reactions', authMiddleware, getAllReactionsByUser);
// ======================= thread's comments ========================
// get all comments(range)
router.get('/get-comments/:thread_id', auth_middleware_1.optionalAuthMiddleware, comments_controller_1.getComments);
// create a new comment
router.post('/add-comment', auth_middleware_1.authMiddleware, comments_controller_1.createComment);
// update comment
router.put('/update-comment/:comment_id', auth_middleware_1.authMiddleware, comments_controller_1.updateComment);
// delete comment
router.delete('/delete-comment/:comment_id', auth_middleware_1.authMiddleware, comments_controller_1.deleteComment);
// handle like/ dislike
router.patch('/apply-comment-react/:comment_id', auth_middleware_1.authMiddleware, comments_controller_1.updateCommentReaction);
// get user's comments reaction by thread
// router.get('/get-all-comment-reaction/:thread_id', authMiddleware, getCommentReactionsByThreadAndUser);
// ======================= comment's replies ========================
// get all comments(range)
router.get('/get-replies/:comment_id', auth_middleware_1.optionalAuthMiddleware, replies_controller_1.getReplies);
// create a new comment
router.post('/add-reply', auth_middleware_1.authMiddleware, replies_controller_1.createReply);
// update comment
router.put('/update-reply/:reply_id', auth_middleware_1.authMiddleware, replies_controller_1.updateReply);
// delete comment
router.delete('/delete-reply/:reply_id', auth_middleware_1.authMiddleware, replies_controller_1.deleteReply);
// handle like/ dislike
router.patch('/apply-reply-react/:reply_id', auth_middleware_1.authMiddleware, replies_controller_1.updateReplyReaction);
// get user's comments reaction by thread
// router.get('/get-reply-reaction/:comment_id', authMiddleware, getSubcommentReactions);
exports.default = router;
