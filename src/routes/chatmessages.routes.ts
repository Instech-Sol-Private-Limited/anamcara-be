import { Router } from 'express';
import {
  getUserConversations,
  getDirectMessages,
  getUserFriends,
  getPublicMessages,
  getTravelMessages,
  createChamber,
  getUserChambers,
  getChamberMessages,
  getChamberMembers,
  joinChamberByInvite,
  getAllChambers,
  updateChamber,
  deleteChamber,
} from '../controllers/chatmessages.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';

const router = Router();

// get concversions
router.get('/get-conversions/:userId', authMiddleware, getUserConversations);

// 🔁 Get direct chat between two users
router.get('/direct/:chatId', authMiddleware, getDirectMessages);

// 👫 Get accepted friends (no chat yet)
router.get('/friends/:userId', authMiddleware, getUserFriends);

// get global chat
router.get('/get-global-chat', authMiddleware, getPublicMessages);

// get travel chat
router.get('/get-travel-chat', authMiddleware, getTravelMessages);

// 👫 Get accepted friends (no chat yet)
router.post('/create-chamber', authMiddleware, createChamber);

// join chamber
router.post('/join-chamber/:invite_code', authMiddleware, joinChamberByInvite);

// get chambers
router.get('/get-chambers/:userId', optionalAuthMiddleware, getUserChambers);

// get chambers
router.get('/get-all-chambers', optionalAuthMiddleware, getAllChambers);

// get chambers
router.put('/update-chamber/:id', authMiddleware, updateChamber);

// delete chambers
router.delete('/delete-chamber/:id', authMiddleware, deleteChamber);

// get chamber members
router.get('/get-chamber-members/:chamber_id', authMiddleware, getChamberMembers);

// get chamber messages
router.get('/get-chamber-messages/:chamber_id', authMiddleware, getChamberMessages);

export default router;
