import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getNotifications } from '../controllers/notifications.controller';

const router = express.Router();

router.get('/get-notifications', authMiddleware, getNotifications);


export default router;