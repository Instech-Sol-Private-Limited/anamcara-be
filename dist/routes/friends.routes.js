"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const friends_controller_1 = require("../controllers/friends.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Send a friend request
router.post('/send-request', auth_middleware_1.authMiddleware, friends_controller_1.sendFriendRequest);
// Accept a friend request
router.post('/accept-request', auth_middleware_1.authMiddleware, friends_controller_1.acceptFriendRequest);
// Reject a friend request
router.post('/reject-request', auth_middleware_1.authMiddleware, friends_controller_1.rejectFriendRequest);
exports.default = router;
