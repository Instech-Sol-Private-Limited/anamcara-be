"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const analytics_controller_1 = require("../controllers/analytics.controller");
const router = express_1.default.Router();
router.get('/top-cards', analytics_controller_1.getTopCardsStats);
router.get('/booking-stats', analytics_controller_1.getBookingStatistics);
router.get('/provider-stats', analytics_controller_1.getProviderStatistics);
router.get('/booking-logs', analytics_controller_1.getBookingLogs);
router.get('/meeting-logs', analytics_controller_1.getMeetingLogs);
exports.default = router;
