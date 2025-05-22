"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const profiles_controller_1 = require("../controllers/profiles.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.put('/', auth_middleware_1.authMiddleware, profiles_controller_1.updateProfile);
router.get('/:id', auth_middleware_1.authMiddleware, profiles_controller_1.getUserProfile);
exports.default = router;
