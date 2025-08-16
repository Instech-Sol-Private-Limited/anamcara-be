import express from 'express';
import { authMiddleware } from "../middleware/auth.middleware";
import { createStory, getAnalytics, getStories } from "../controllers/soulStories/soulStories.controlller"

const router = express.Router();

router.post("/create-story", authMiddleware, createStory);
router.get("/analytics", authMiddleware, getAnalytics);
router.get("/get-stories/:type", authMiddleware, getStories);

export default router;