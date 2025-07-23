import express from "express";
import { createStory, deleteStory, getStories } from "../controllers/stories.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();

// Create a new story
router.post("/create-story", createStory);

// Delete a story
router.delete("/delete-story/:id", deleteStory);

// Get all stories from friends (last 24 hours)
router.get("/get-stories", getStories);

export default router;