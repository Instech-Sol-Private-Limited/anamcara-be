import express from 'express';
import {
   registerController,
   verifyEmailController,
   loginController,
   forgotPasswordController,
   resetPasswordController,
   becomeSellerController,
   getSellerDataController
} from '../controllers/users.controllers';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// ======================= users ========================

// Create a new user
router.post('/register', registerController);

router.get('/verify', verifyEmailController);

router.post('/login', loginController);

router.post("/forgot-password", forgotPasswordController);

router.post("/reset-password", resetPasswordController);

router.post("/become-seller", authMiddleware, becomeSellerController);

router.get("/get-seller-data", authMiddleware, getSellerDataController);

export default router;