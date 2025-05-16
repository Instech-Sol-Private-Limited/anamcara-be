import express from 'express';
import { updateProfile, getUserProfile } from '../controllers/profiles/profiles.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

router.put('/', authMiddleware, updateProfile);


router.get('/:id', authMiddleware, getUserProfile);

export default router;