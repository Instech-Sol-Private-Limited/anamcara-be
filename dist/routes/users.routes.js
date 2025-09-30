"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const users_controller_1 = require("../controllers/users.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// ======================= users ========================
// Create a new user
// router.post('/register', registerController);
// router.get('/verify', verifyEmailController);
// router.post('/login', loginController);
// router.post("/forgot-password", forgotPasswordController);
// router.post("/reset-password", resetPasswordController);
router.post("/become-seller", auth_middleware_1.authMiddleware, users_controller_1.becomeSellerController);
router.get("/get-seller-data/:id", auth_middleware_1.authMiddleware, users_controller_1.getSellerDataController);
router.post("/add-seller-service", auth_middleware_1.authMiddleware, users_controller_1.addSellerservice);
router.get("/get-all-services", auth_middleware_1.authMiddleware, users_controller_1.getAllServices);
router.get("/get-seller-services", auth_middleware_1.authMiddleware, users_controller_1.getSellerServices);
router.get("/get-service/:id", auth_middleware_1.authMiddleware, users_controller_1.getServiceById);
router.post("/generate-summary", auth_middleware_1.authMiddleware, users_controller_1.generateSummary);
// --------------- 2FA CONTROLLERS -----------------
router.get('/2fa/status', auth_middleware_1.authMiddleware, users_controller_1.get2FAStatusController);
router.post('/2fa/setup', auth_middleware_1.authMiddleware, users_controller_1.setup2FAController);
router.post('/2fa/verify-setup', auth_middleware_1.authMiddleware, users_controller_1.verify2FASetupController);
router.post('/2fa/enable', auth_middleware_1.authMiddleware, users_controller_1.enable2FAController);
router.post('/2fa/disable', auth_middleware_1.authMiddleware, users_controller_1.disable2FAController);
router.post('/2fa/verify-login', users_controller_1.verify2FALoginController);
router.post('/2fa/verify-backup-code', users_controller_1.verify2FABackupCodeController);
router.post('/2fa/regenerate-backup-codes', auth_middleware_1.authMiddleware, users_controller_1.regenerateBackupCodesController);
router.get('/2fa/trusted-devices', auth_middleware_1.authMiddleware, users_controller_1.getTrustedDevicesController);
router.delete('/2fa/trusted-device/:deviceId', auth_middleware_1.authMiddleware, users_controller_1.removeTrustedDeviceController);
router.get("/unapproved-users", auth_middleware_1.authMiddleware, users_controller_1.getUnapprovedUsersController);
router.post("/approve-user/:userId", auth_middleware_1.authMiddleware, users_controller_1.approveUserController);
exports.default = router;
