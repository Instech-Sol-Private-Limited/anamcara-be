import { Router } from 'express';
import {
  getUserConversations,
  getDirectMessages,
  getUserFriends,
  getPublicMessages,
} from '../controllers/chatmessages.controller';

const router = Router();

// get concversions
router.get('/get-conversions/:userId', getUserConversations);

// 🔁 Get direct chat between two users
router.get('/direct/:chatId', getDirectMessages);

// 👫 Get accepted friends (no chat yet)
router.get('/friends/:userId', getUserFriends);

// 👫 Get accepted friends (no chat yet)
router.get('/get-global-chat', getPublicMessages);

export default router;
