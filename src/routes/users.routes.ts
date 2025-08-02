import express from 'express';
import {
   registerController,
   verifyEmailController,
   loginController,
   forgotPasswordController,
   resetPasswordController,
   becomeSellerController,
   getSellerDataController,
   addSellerservice,
   getAllServices,
   getSellerServices,
   getServiceById
} from '../controllers/users.controller';
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

router.get("/get-seller-data/:id", authMiddleware, getSellerDataController);

router.post("/add-seller-service", authMiddleware, addSellerservice);

router.get("/get-all-services", authMiddleware, getAllServices);

router.get("/get-seller-services", authMiddleware, getSellerServices);

router.get("/get-service/:id", authMiddleware, getServiceById);

export default router;