"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const users_controllers_1 = require("../controllers/users.controllers");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// ======================= users ========================
// Create a new user
router.post('/register', users_controllers_1.registerController);
router.get('/verify', users_controllers_1.verifyEmailController);
router.post('/login', users_controllers_1.loginController);
router.post("/forgot-password", users_controllers_1.forgotPasswordController);
router.post("/reset-password", users_controllers_1.resetPasswordController);
router.post("/become-seller", auth_middleware_1.authMiddleware, users_controllers_1.becomeSellerController);
router.get("/get-seller-data", auth_middleware_1.authMiddleware, users_controllers_1.getSellerDataController);
router.post("/add-seller-service", auth_middleware_1.authMiddleware, users_controllers_1.addSellerservice);
router.post("/get-all-services", auth_middleware_1.authMiddleware, users_controllers_1.getAllServices);
router.get("/get-seller-services", auth_middleware_1.authMiddleware, users_controllers_1.getSellerServices);
router.get("/get-service/:id", auth_middleware_1.authMiddleware, users_controllers_1.getServiceById);
exports.default = router;
