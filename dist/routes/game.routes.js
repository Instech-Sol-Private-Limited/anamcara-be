"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/game.routes.ts
const express_1 = require("express");
const game_controller_1 = require("../controllers/game.controller");
const router = (0, express_1.Router)();
// Send chess invitation (supports both friends and random users)
router.post('/chess/invite', game_controller_1.sendChessInvite);
// Accept chess invitation
router.post('/chess/accept/:invitation_id', game_controller_1.acceptChessInvite);
// Create chess room
router.post('/chess/create-room', game_controller_1.createChessRoom);
// Get chess game room details
router.get('/chess/room/:room_id', game_controller_1.getChessGameRoom);
// Save game result
router.post('/chess/save-result/:room_id', game_controller_1.saveGameResult);
// Get all users
router.get('/chess/users', game_controller_1.fetchAllUsers);
router.get('/chess/ranking', game_controller_1.getPlayerChessRanking);
exports.default = router;
