"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
// Create a new post
router.post('/', auth_middleware_1.authMiddleware, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, posts_controller_1.createPost)(req, res);
    }
    catch (err) {
        next(err);
    }
}));
// Get all posts with pagination
router.get('/', auth_middleware_1.authMiddleware, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, posts_controller_1.getPosts)(req, res);
    }
    catch (err) {
        next(err);
    }
}));
// Get trending posts
router.get('/trending', auth_middleware_1.authMiddleware, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, posts_controller_1.getTrendingPosts)(req, res);
    }
    catch (err) {
        next(err);
    }
}));
// Get posts by specific user
router.get('/user/:userId', auth_middleware_1.authMiddleware, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, posts_controller_1.getUserPosts)(req, res);
    }
    catch (err) {
        next(err);
    }
}));
// Get single post
// router.get('/:postId', authMiddleware, async (req, res, next) => {
//   try {
//     await getPost(req, res);
//   } catch (err) {
//     next(err);
//   }
// });
// Update post
router.put('/:postId', auth_middleware_1.authMiddleware, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, posts_controller_1.updatePost)(req, res);
    }
    catch (err) {
        next(err);
    }
}));
// Delete post (soft delete)
router.delete('/:postId', auth_middleware_1.authMiddleware, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, posts_controller_1.deletePost)(req, res);
    }
    catch (err) {
        next(err);
    }
}));
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
router.post('/:postId/vote', auth_middleware_1.authMiddleware, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, posts_controller_1.voteOnPoll)(req, res);
    }
    catch (err) {
        next(err);
    }
}));
// Get poll results
router.get('/:postId/results', auth_middleware_1.authMiddleware, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, posts_controller_1.getPollResults)(req, res);
    }
    catch (err) {
        next(err);
    }
}));
router.patch('/apply-react/:postId', auth_middleware_1.authMiddleware, posts_controller_1.updatePostReaction);
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
