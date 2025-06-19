// src/routes/chatRoutes.ts
import { Router } from 'express';
import * as ChatController from '../controllers/chat.controller';

const router = Router();


router.post('/send', ChatController.sendMessage);

router.get('/messages/:conversationId', ChatController.getMessages);

router.delete('/messages/:conversationId', ChatController.clearMessages);

export default router;