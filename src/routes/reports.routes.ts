import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { createThreadReport, getReportedThreads, getReportsByThreadId, createPostReport, getReportsByPostId } from '../controllers/reports.controller';

const router = express.Router();

// create spam thread
router.post('/create-report', authMiddleware, createThreadReport);

// create spam post
router.post('/create-post-report', authMiddleware, createPostReport);

// get all reports
router.get('/get-all-reports', authMiddleware, getReportedThreads);

// get reports by thread id
router.get('/get-reports/:thread_id', authMiddleware, getReportsByThreadId);

router.get('/get-reports-by-post-id/:post_id', getReportsByPostId);

export default router;
