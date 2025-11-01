import express from 'express';
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.middleware";
import { 
    createStory, 
    updateStory, 
    getAnalytics, 
    getStories,
    deleteeStory, 
    getStoryAccess,
    getUserRevenue,
    searchAllContent,
    // createComment,
    // createReply,
    // getComments,
    // updateComment,
    // deleteComment,
    // updateCommentReaction,
    getStoryWithReactions,
    getCommentReactions,
    getTrendingStories,
    boostSoulStory,
    getUserSoulStoryBoosts,
    getProductDetails,
    getAllUsersStoriesData,
    createStoryReport,
    getStoryReports,
    getUserFriends,
    generateThumbnailSuggestions,
    generateQuickSuggestion,getKeywordSuggestions,correctGrammar,
    uploadPdf,
    shareStory,
    purchaseAIToolAccess,
    getUserStories,
    updateSoulStoryReaction,
    getSoulStoryById,
    purchaseStory
} from "../controllers/soulstories.controller"
import { updateVote } from '../controllers/posts.controller';
import { createComment, deleteComment, getComments, updateComment, updateCommentReaction, updateCommentsVote, updateSaveContent } from '../controllers/threads/comments.controller';
import { createReply, deleteReply, getReplies, updateReply, updateReplyReaction } from '../controllers/threads/replies.controller';


const router = express.Router();


router.post("/create-story", authMiddleware, createStory);

router.put("/update-story/:story_id", authMiddleware, updateStory);

router.get("/get-user-stories", authMiddleware, getUserStories);

router.get("/trending", optionalAuthMiddleware, getTrendingStories);

router.get("/get-story/:id", optionalAuthMiddleware, getSoulStoryById);

router.patch("/apply-reaction/:soulStoryId", authMiddleware, updateSoulStoryReaction);

router.post('/votes/:targetId', authMiddleware, updateVote);

router.get("/get-stories", optionalAuthMiddleware, getStories);

router.post("/search", optionalAuthMiddleware, searchAllContent);

router.post("/purchase-content", authMiddleware, purchaseStory);


// ========== Story Comments ==========
router.get('/get-comments', optionalAuthMiddleware, getComments);

router.post('/:postId/comments', optionalAuthMiddleware, createComment);

router.put('/comments/:comment_id', optionalAuthMiddleware, updateComment);

router.delete('/comments/:comment_id', optionalAuthMiddleware, deleteComment);

router.patch('/comments/:comment_id/apply-react', authMiddleware, updateCommentReaction);

router.post('/comments/:targetId/vote', authMiddleware, updateCommentsVote);

router.post('/comments/:targetId/save', authMiddleware, updateSaveContent);


// ========== Story Replies ==========
router.get('/comments/:comment_id/replies', optionalAuthMiddleware, getReplies);

router.post('/comments/:comment_id/replies', authMiddleware, createReply);

router.put('/replies/:reply_id', authMiddleware, updateReply);

router.delete('/replies/:reply_id', authMiddleware, deleteReply);

router.patch('/replies/:reply_id/apply-react', authMiddleware, updateReplyReaction);

router.post('/subcomments/:targetId/vote', authMiddleware, updateCommentsVote);

router.post('/subcomments/:targetId/save', authMiddleware, updateSaveContent);







router.get("/analytics", authMiddleware, getAnalytics);

router.delete("/delete-story/:story_id", authMiddleware, deleteeStory);

router.get("/story-access/:storyId", authMiddleware, getStoryAccess);

router.get("/user-revenue", authMiddleware, getUserRevenue);



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

router.get("/get-story-with-reactions/:story_id", optionalAuthMiddleware, getStoryWithReactions);

// ======================= Soul Story Reports ========================
router.post("/report-story", authMiddleware, createStoryReport);

router.get("/story-reports/:storyId", authMiddleware, getStoryReports);

// ======================= User Friends ========================
router.get("/friends", authMiddleware, getUserFriends);

// AI Thumbnail Suggestion Routes
router.post('/suggestions/thumbnail', 
  authMiddleware, 
  generateThumbnailSuggestions
);

router.post('/suggestions/thumbnail/quick', 
  authMiddleware, 
  generateQuickSuggestion
);

router.post('/upload-pdf', authMiddleware, uploadPdf);

router.get('/keyword-suggestions',authMiddleware, getKeywordSuggestions);

router.post('/correct-grammar',authMiddleware, correctGrammar);

router.post('/share-story', authMiddleware, shareStory);

router.post('/ai-tools/purchase', authMiddleware, purchaseAIToolAccess);


export default router;