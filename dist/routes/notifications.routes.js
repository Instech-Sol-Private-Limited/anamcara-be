"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const notifications_controller_1 = require("../controllers/notifications.controller");
const router = express_1.default.Router();
router.get('/get-notifications', auth_middleware_1.authMiddleware, notifications_controller_1.getNotifications);
exports.default = router;
