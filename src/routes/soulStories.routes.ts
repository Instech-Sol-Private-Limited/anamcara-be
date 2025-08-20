import express from 'express';
import { authMiddleware } from "../middleware/auth.middleware";
import { createStory, getAnalytics, getStories,deleteeStory, purchaseContent,        // Add this
    getStoryAccess,         // Add this
    getUserRevenue } from "../controllers/soulStories/soulStories.controlller"

const router = express.Router();

router.post("/create-story", authMiddleware, createStory);
router.get("/analytics", authMiddleware, getAnalytics);
router.get("/get-stories/:type", authMiddleware, getStories);
router.delete("/delete-story/:story_id", authMiddleware, deleteeStory);
router.post("/purchase-content",authMiddleware,purchaseContent);
router.get("/story-access/:storyId",authMiddleware,getStoryAccess);
router.get("/user-revenue",authMiddleware,getUserRevenue)
export default router;