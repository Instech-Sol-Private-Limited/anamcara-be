"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatmessages_controller_1 = require("../controllers/chatmessages.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// get concversions
router.get('/get-conversions/:userId', auth_middleware_1.authMiddleware, chatmessages_controller_1.getUserConversations);
// 🔁 Get direct chat between two users
router.get('/direct/:chatId', auth_middleware_1.authMiddleware, chatmessages_controller_1.getDirectMessages);
// 👫 Get accepted friends (no chat yet)
router.get('/friends/:userId', auth_middleware_1.authMiddleware, chatmessages_controller_1.getUserFriends);
// get global chat
router.get('/get-global-chat', auth_middleware_1.authMiddleware, chatmessages_controller_1.getPublicMessages);
// get travel chat
router.get('/get-travel-chat', auth_middleware_1.authMiddleware, chatmessages_controller_1.getTravelMessages);
// 👫 Get accepted friends (no chat yet)
router.post('/create-chamber', auth_middleware_1.authMiddleware, chatmessages_controller_1.createChamber);
// join chamber
router.post('/join-chamber/:invite_code', auth_middleware_1.authMiddleware, chatmessages_controller_1.joinChamberByInvite);
// get chambers
router.get('/get-chambers', auth_middleware_1.authMiddleware, chatmessages_controller_1.getUserChambers);
// get chambers
router.get('/get-all-chambers', auth_middleware_1.optionalAuthMiddleware, chatmessages_controller_1.getAllChambers);
// get chambers
router.put('/update-chamber/:id', auth_middleware_1.optionalAuthMiddleware, chatmessages_controller_1.updateChamber);
// get chamber members
router.get('/get-chamber-members/:chamber_id', auth_middleware_1.authMiddleware, chatmessages_controller_1.getChamberMembers);
// get chamber messages
router.get('/get-chamber-messages/:chamber_id', auth_middleware_1.authMiddleware, chatmessages_controller_1.getChamberMessages);
exports.default = router;
