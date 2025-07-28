"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const reports_controller_1 = require("../controllers/reports.controller");
const router = express_1.default.Router();
// create spam thread
router.post('/create-report', auth_middleware_1.authMiddleware, reports_controller_1.createThreadReport);
// create spam post
router.post('/create-post-report', auth_middleware_1.authMiddleware, reports_controller_1.createPostReport);
// get all reports
router.get('/get-all-reports', auth_middleware_1.authMiddleware, reports_controller_1.getReportedThreads);
// get reports by thread id
router.get('/get-reports/:thread_id', auth_middleware_1.authMiddleware, reports_controller_1.getReportsByThreadId);
router.get('/get-reports-by-post-id/:post_id', reports_controller_1.getReportsByPostId);
router.get('/get-all-post-reports', auth_middleware_1.authMiddleware, reports_controller_1.getReportedPosts);
exports.default = router;
