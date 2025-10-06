"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const soulStories_controller_1 = require("../controllers/soulStories/soulStories.controller");
const router = express_1.default.Router();
router.post("/create-story", auth_middleware_1.authMiddleware, soulStories_controller_1.createStory);
router.get("/analytics", auth_middleware_1.authMiddleware, soulStories_controller_1.getAnalytics);
router.get("/get-stories/:type", auth_middleware_1.authMiddleware, soulStories_controller_1.getStories);
router.delete("/delete-story/:story_id", auth_middleware_1.authMiddleware, soulStories_controller_1.deleteeStory);
router.post("/purchase-content", auth_middleware_1.authMiddleware, soulStories_controller_1.purchaseContent);
router.get("/story-access/:storyId", auth_middleware_1.authMiddleware, soulStories_controller_1.getStoryAccess);
router.get("/user-revenue", auth_middleware_1.authMiddleware, soulStories_controller_1.getUserRevenue);
router.post("/search", auth_middleware_1.authMiddleware, soulStories_controller_1.searchAllContent);
router.get("/trending", auth_middleware_1.optionalAuthMiddleware, soulStories_controller_1.getTrendingStories);
router.get("/soul-stories-products", auth_middleware_1.authMiddleware, soulStories_controller_1.getProductDetails);
router.get("/all-users-stories-data", auth_middleware_1.authMiddleware, soulStories_controller_1.getAllUsersStoriesData);
router.put("/update-story/:story_id", auth_middleware_1.authMiddleware, soulStories_controller_1.updateStory);
// ======================= Soul Story Boosting ========================
router.post("/boost-story", auth_middleware_1.authMiddleware, soulStories_controller_1.boostSoulStory);
router.get("/user-boosts", auth_middleware_1.authMiddleware, soulStories_controller_1.getUserSoulStoryBoosts);
// ======================= Soul Story Comments & Replies ========================
router.get("/get-comments", auth_middleware_1.optionalAuthMiddleware, soulStories_controller_1.getComments);
router.post("/add-comment", auth_middleware_1.authMiddleware, soulStories_controller_1.createComment);
router.post("/add-reply", auth_middleware_1.authMiddleware, soulStories_controller_1.createReply);
router.put("/update-comment/:comment_id", auth_middleware_1.authMiddleware, soulStories_controller_1.updateComment);
router.delete("/delete-comment/:comment_id", auth_middleware_1.authMiddleware, soulStories_controller_1.deleteComment);
router.patch("/apply-comment-react/:comment_id", auth_middleware_1.authMiddleware, soulStories_controller_1.updateCommentReaction);
// ======================= Comment Reactions ========================
router.get("/comment-reactions/:comment_id", auth_middleware_1.optionalAuthMiddleware, soulStories_controller_1.getCommentReactions);
// ======================= Soul Story Reactions ========================
router.patch("/apply-story-react/:story_id", auth_middleware_1.authMiddleware, soulStories_controller_1.updateStoryReaction);
router.get("/get-story-with-reactions/:story_id", auth_middleware_1.optionalAuthMiddleware, soulStories_controller_1.getStoryWithReactions);
// ======================= Soul Story Reports ========================
router.post("/report-story", auth_middleware_1.authMiddleware, soulStories_controller_1.createStoryReport);
router.get("/story-reports/:storyId", auth_middleware_1.authMiddleware, soulStories_controller_1.getStoryReports);
// ======================= User Friends ========================
router.get("/friends", auth_middleware_1.authMiddleware, soulStories_controller_1.getUserFriends);
// AI Thumbnail Suggestion Routes
router.post('/suggestions/thumbnail', auth_middleware_1.authMiddleware, soulStories_controller_1.generateThumbnailSuggestions);
router.post('/suggestions/thumbnail/quick', auth_middleware_1.authMiddleware, soulStories_controller_1.generateQuickSuggestion);
router.post('/upload-pdf', auth_middleware_1.authMiddleware, soulStories_controller_1.uploadPdf);
router.get('/keyword-suggestions', auth_middleware_1.authMiddleware, soulStories_controller_1.getKeywordSuggestions);
router.post('/correct-grammar', auth_middleware_1.authMiddleware, soulStories_controller_1.correctGrammar);
router.post('/share-story', auth_middleware_1.authMiddleware, soulStories_controller_1.shareStory);
router.post('/ai-tools/purchase', auth_middleware_1.authMiddleware, soulStories_controller_1.purchaseAIToolAccess);
// ... existing routes ...
exports.default = router;
