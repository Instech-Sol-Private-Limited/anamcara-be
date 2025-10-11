import express from "express";
import { createStory, deleteStory, getStories } from "../controllers/stories.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/create-story", authMiddleware, createStory);

router.delete("/delete-story/:id", authMiddleware, deleteStory);

router.get("/get-stories", authMiddleware, getStories);

export default router;