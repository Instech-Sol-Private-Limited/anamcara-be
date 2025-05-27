import express from 'express';
import { updateProfile, getUserProfile } from '../controllers/profiles.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

router.put('/', authMiddleware, async (req, res, next) => {
  try {
	await updateProfile(req, res);
  } catch (err) {
	next(err);
  }
});

router.get('/:id', authMiddleware, getUserProfile);

export default router;