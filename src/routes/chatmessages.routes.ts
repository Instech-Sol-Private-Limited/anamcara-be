import { Router } from 'express';
import {
  getUserConversations,
  getDirectMessages,
  getUserFriends,
} from '../controllers/chatmessages.controller';

const router = Router();


router.get('/get-conversions/:userId', getUserConversations);

// 🔁 Get direct chat between two users
router.get('/direct/:user1/:user2', getDirectMessages);

// 👫 Get accepted friends (no chat yet)
router.get('/friends/:userId', getUserFriends);

export default router;
