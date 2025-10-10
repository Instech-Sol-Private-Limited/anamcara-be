"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const anamfamily_controller_1 = require("../controllers/anamfamily.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.post('/send-email', auth_middleware_1.authMiddleware, anamfamily_controller_1.sendEmail);
exports.default = router;
