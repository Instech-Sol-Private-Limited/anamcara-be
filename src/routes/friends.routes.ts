import express from 'express';
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
} from '../controllers/friends.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Send a friend request
router.post('/send-request', authMiddleware, sendFriendRequest);

// Accept a friend request
router.post('/accept-request', authMiddleware, acceptFriendRequest);

// Reject a friend request
router.post('/reject-request', authMiddleware, rejectFriendRequest);

export default router;