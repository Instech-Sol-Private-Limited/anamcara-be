// src/routes/game.routes.ts
import { Router } from 'express';
import {
  sendChessInvite,
  acceptChessInvite,
  createChessRoom,
  getChessGameRoom,
  saveGameResult
} from '../controllers/game.controller';

const router = Router();

// Send chess invitation
router.post('/chess/invite', sendChessInvite);

// Accept chess invitation
router.post('/chess/accept/:invitation_id', acceptChessInvite);

// Create chess room
router.post('/chess/create-room', createChessRoom);

// Get chess game room details
router.get('/chess/room/:room_id', getChessGameRoom);

// Save game result
router.post('/chess/save-result/:room_id', saveGameResult);

export default router;