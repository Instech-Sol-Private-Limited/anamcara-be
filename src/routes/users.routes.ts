import express from 'express';
import {
   // registerController,
   // verifyEmailController,
   // loginController,
   // forgotPasswordController,
   // resetPasswordController,
   becomeSellerController,
   getSellerDataController,
   addSellerservice,
   getAllServices,
   getSellerServices,
   getServiceById,
   generateSummary,
   get2FAStatusController,
   setup2FAController,
   verify2FASetupController,
   enable2FAController,
   disable2FAController,
   verify2FALoginController,
   verify2FABackupCodeController,
   removeTrustedDeviceController,
   getTrustedDevicesController,
   regenerateBackupCodesController,
   getUnapprovedUsersController,
   approveUserController
} from '../controllers/users.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// ======================= users ========================

// Create a new user
// router.post('/register', registerController);

// router.get('/verify', verifyEmailController);

// router.post('/login', loginController);

// router.post("/forgot-password", forgotPasswordController);

// router.post("/reset-password", resetPasswordController);

router.post("/become-seller", authMiddleware, becomeSellerController);

router.get("/get-seller-data/:id", authMiddleware, getSellerDataController);

router.post("/add-seller-service", authMiddleware, addSellerservice);

router.get("/get-all-services", authMiddleware, getAllServices);

router.get("/get-seller-services", authMiddleware, getSellerServices);

router.get("/get-service/:id", authMiddleware, getServiceById);

router.post("/generate-summary", authMiddleware, generateSummary);




// --------------- 2FA CONTROLLERS -----------------
router.get('/2fa/status', authMiddleware, get2FAStatusController)

router.post('/2fa/setup', authMiddleware, setup2FAController)

router.post('/2fa/verify-setup', authMiddleware, verify2FASetupController);

router.post('/2fa/enable', authMiddleware, enable2FAController);

router.post('/2fa/disable', authMiddleware, disable2FAController);

router.post('/2fa/verify-login', verify2FALoginController);

router.post('/2fa/verify-backup-code', verify2FABackupCodeController);

router.post('/2fa/regenerate-backup-codes', authMiddleware, regenerateBackupCodesController);

router.get('/2fa/trusted-devices', authMiddleware, getTrustedDevicesController);

router.delete('/2fa/trusted-device/:deviceId', authMiddleware, removeTrustedDeviceController);
router.get("/unapproved-users", authMiddleware, getUnapprovedUsersController);

router.post("/approve-user/:userId", authMiddleware, approveUserController);
export default router;