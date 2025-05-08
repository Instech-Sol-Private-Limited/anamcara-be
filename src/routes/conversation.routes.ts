// src/routes/conversation.routes.ts
import { Router } from 'express';
import * as ConversationController from '../controllers/conversation.controller'; 

const router = Router();


router.get('/', ConversationController.getConversations);


router.post('/', ConversationController.createConversation);

router.get('/:id', ConversationController.getConversationById);


router.put('/:id', ConversationController.updateConversation);


router.delete('/:id', ConversationController.deleteConversation);

export default router;