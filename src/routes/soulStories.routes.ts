import express from 'express';
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.middleware";
import { 
    createStory, 
    getAnalytics, 
    getStories,
    deleteeStory, 
    purchaseContent,
    getStoryAccess,
    getUserRevenue,
    searchAllContent,
    createComment,
    createReply,
    getComments,
    updateComment,
    deleteComment,
    updateCommentReaction,
    updateStoryReaction,
    getStoryWithReactions,
    getCommentReactions,
    getTrendingStories,
    boostSoulStory,
    getUserSoulStoryBoosts,
    getProductDetails,
    getAllUsersStoriesData,
    createStoryReport,
    getStoryReports
} from "../controllers/soulStories/soulStories.controlller"

const router = express.Router();

router.post("/create-story", authMiddleware, createStory);
router.get("/analytics", authMiddleware, getAnalytics);
router.get("/get-stories/:type", authMiddleware, getStories);
router.delete("/delete-story/:story_id", authMiddleware, deleteeStory);
router.post("/purchase-content", authMiddleware, purchaseContent);
router.get("/story-access/:storyId", authMiddleware, getStoryAccess);
router.get("/user-revenue", authMiddleware, getUserRevenue);
router.post("/search", authMiddleware, searchAllContent);
router.get("/trending", optionalAuthMiddleware, getTrendingStories);
router.get("/soul-stories-products", authMiddleware, getProductDetails);
router.get("/all-users-stories-data", authMiddleware, getAllUsersStoriesData);

// ======================= Soul Story Boosting ========================
router.post("/boost-story", authMiddleware, boostSoulStory);
router.get("/user-boosts", authMiddleware, getUserSoulStoryBoosts);

// ======================= Soul Story Comments & Replies ========================
router.get("/get-comments", optionalAuthMiddleware, getComments);
router.post("/add-comment", authMiddleware, createComment);
router.post("/add-reply", authMiddleware, createReply);
router.put("/update-comment/:comment_id", authMiddleware, updateComment);
router.delete("/delete-comment/:comment_id", authMiddleware, deleteComment);
router.patch("/apply-comment-react/:comment_id", authMiddleware, updateCommentReaction);

// ======================= Comment Reactions ========================
router.get("/comment-reactions/:comment_id", optionalAuthMiddleware, getCommentReactions);

// ======================= Soul Story Reactions ========================
router.patch("/apply-story-react/:story_id", authMiddleware, updateStoryReaction);
router.get("/get-story-with-reactions/:story_id", optionalAuthMiddleware, getStoryWithReactions);

// ======================= Soul Story Reports ========================
router.post("/report-story", authMiddleware, createStoryReport);
router.get("/story-reports/:storyId", authMiddleware, getStoryReports);

export default router;