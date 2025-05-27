import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { createThreadReport, getReportedThreads, getReportsByThreadId } from '../controllers/reports.controller';

const router = express.Router();

// create spam thread
router.post('/create-report', authMiddleware, createThreadReport);

// get all reports
router.get('/get-all-reports', authMiddleware, getReportedThreads);

// get reports by thread id
router.get('/get-reports/:thread_id', authMiddleware, getReportsByThreadId);

export default router;
