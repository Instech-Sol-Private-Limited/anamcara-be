import express from "express";
import { createStory, deleteStory, getStories } from "../controllers/stories.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();

// Create a new story
router.post("/create-story", authMiddleware, createStory);

// Delete a story
router.delete("delete-story/:id", authMiddleware, deleteStory);

// Get all stories from friends (last 24 hours)
router.get("/get-stories", authMiddleware, getStories);

export default router;