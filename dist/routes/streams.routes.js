"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const streaming_handler_1 = require("../sockets/streaming.handler");
const router = express_1.default.Router();
// get streams
router.get("/", auth_middleware_1.authMiddleware, streaming_handler_1.getActiveStreams);
router.get("/trending", auth_middleware_1.authMiddleware, streaming_handler_1.getActiveStreams);
exports.default = router;
