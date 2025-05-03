
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();


router.get('/profile', authMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    data: req.user
  });
});

export default router;