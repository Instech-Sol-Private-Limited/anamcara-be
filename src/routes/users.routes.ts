import express from 'express';
import {
     registerController ,
     verifyEmailController ,
    loginController,
    forgotPasswordController,
    resetPasswordController
 } from '../controllers/users.controllers';

const router = express.Router();

// ======================= users ========================

// Create a new user
router.post('/register', registerController);
router.get('/verify', verifyEmailController);
router.post('/login', loginController);
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password", resetPasswordController);
export default router;