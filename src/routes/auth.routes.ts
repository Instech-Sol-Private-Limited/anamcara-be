
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { createProfile } from '../controllers/users.controller';

const router = Router();


router.get('/profile', authMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    data: req.user
  });
});

router.post('/', createProfile);

export default router;