import express from 'express';
import { sendEmail } from '../controllers/anamfamily.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/send-email', authMiddleware, sendEmail);

export default router;
