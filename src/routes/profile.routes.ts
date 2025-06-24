import express from 'express';
import { updateProfile, getUserProfile, getAboutInfo } from '../controllers/profiles.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

router.put('/', authMiddleware, async (req, res, next) => {
  try {
    await updateProfile(req, res);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    await getUserProfile(req, res);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/about', authMiddleware, async (req, res, next) => {
  try {
    await getAboutInfo(req, res);
  } catch (err) {
    next(err);
  }
});

export default router;