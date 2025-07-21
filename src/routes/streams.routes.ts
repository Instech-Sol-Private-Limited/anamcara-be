import express from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { getActiveStreams } from "../sockets/streaming.handler";

const router = express.Router();

// get streams
router.get("/", authMiddleware, getActiveStreams);

router.get("/trending", authMiddleware, getActiveStreams);

export default router;