// src/routes/game.routes.ts
import { Router } from 'express';
import {
  sendChessInvite,
  acceptChessInvite,
  createChessRoom,
  getChessGameRoom,
  saveGameResult,
  fetchAllUsers, 
  getPlayerChessRanking,
  createAIGame,
  requestAIMove,
  getAIGameStatus,           // Add this
  generateAIMoveWithBoard,   // Add this
  getChessLeaderboard        // Add this
} from '../controllers/game.controller';

const router = Router();

// Send chess invitation (supports both friends and random users)
router.post('/chess/invite', sendChessInvite);

// Accept chess invitation
router.post('/chess/accept/:invitation_id', acceptChessInvite);

// Create chess room
router.post('/chess/create-room', createChessRoom);

// Get chess game room details
router.get('/chess/room/:room_id', getChessGameRoom);

// Save game result
router.post('/chess/save-result/:room_id', saveGameResult);

// Get all users
router.get('/chess/users', fetchAllUsers);
router.get('/chess/ranking', getPlayerChessRanking);

// AI game routes
router.post('/chess/ai/create', createAIGame);
router.post('/chess/ai/move/:room_id', requestAIMove);
router.get('/chess/ai/status/:room_id', getAIGameStatus);
router.post('/chess/ai/generate-move/:room_id', generateAIMoveWithBoard);
router.get('/chess/leaderboard', getChessLeaderboard);

export default router;