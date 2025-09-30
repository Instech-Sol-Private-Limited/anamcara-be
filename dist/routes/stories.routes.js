"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const stories_controller_1 = require("../controllers/stories.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Create a new story
router.post("/create-story", auth_middleware_1.authMiddleware, stories_controller_1.createStory);
// Delete a story
router.delete("/delete-story/:id", auth_middleware_1.authMiddleware, stories_controller_1.deleteStory);
// Get all stories from friends (last 24 hours)
router.get("/get-stories", auth_middleware_1.authMiddleware, stories_controller_1.getStories);
exports.default = router;
