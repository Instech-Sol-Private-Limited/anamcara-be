import { Router } from 'express';
import {
  getUserConversations,
  getDirectMessages,
  getUserFriends,
  getPublicMessages,
  getTravelMessages,
} from '../controllers/chatmessages.controller';

const router = Router();

// get concversions
router.get('/get-conversions/:userId', getUserConversations);

// 🔁 Get direct chat between two users
router.get('/direct/:chatId', getDirectMessages);

// 👫 Get accepted friends (no chat yet)
router.get('/friends/:userId', getUserFriends);

// get global chat
router.get('/get-global-chat', getPublicMessages);

// get travel chat
router.get('/get-travel-chat', getTravelMessages);

// 👫 Get accepted friends (no chat yet)
router.post('/create-chamber', getPublicMessages);

export default router;
