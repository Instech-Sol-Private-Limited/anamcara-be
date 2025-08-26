import express from 'express';
import {
  getTopCardsStats,
  getBookingStatistics,
  getProviderStatistics,
  getBookingLogs,
  getMeetingLogs
} from '../controllers/analytics.controller';

const router = express.Router();

router.get('/top-cards', getTopCardsStats);

router.get('/booking-stats', getBookingStatistics);

router.get('/provider-stats', getProviderStatistics);

router.get('/booking-logs', getBookingLogs);

router.get('/meeting-logs', getMeetingLogs);

export default router;