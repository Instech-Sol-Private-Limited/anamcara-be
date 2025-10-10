"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth_middleware_1 = require("../middleware/auth.middleware");
const express_1 = __importDefault(require("express"));
const bankaccount_controller_1 = require("../controllers/bankaccount.controller");
const router = express_1.default.Router();
// Bank Account Routes
router.get('/', auth_middleware_1.authMiddleware, bankaccount_controller_1.getUserBankAccounts);
router.get('/primary', auth_middleware_1.authMiddleware, bankaccount_controller_1.getPrimaryBankAccount);
router.post('/', auth_middleware_1.authMiddleware, bankaccount_controller_1.createBankAccount);
router.delete('/:id', auth_middleware_1.authMiddleware, bankaccount_controller_1.deleteBankAccount);
router.patch('/:id/set-primary', auth_middleware_1.authMiddleware, bankaccount_controller_1.setPrimaryBankAccount);
// Withdrawal Routes
router.post('/withdraw-request', auth_middleware_1.authMiddleware, bankaccount_controller_1.createWithdrawalRequest);
router.get('/withdrawal-history', auth_middleware_1.authMiddleware, bankaccount_controller_1.getWithdrawalRequests);
router.get('/withdraw/history/:id', auth_middleware_1.authMiddleware, bankaccount_controller_1.getWithdrawalRequestById);
router.patch('/withdraw/history/:id/cancel', auth_middleware_1.authMiddleware, bankaccount_controller_1.cancelWithdrawalRequest);
// admin routes
router.get('/admin/all', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRole)('superadmin'), bankaccount_controller_1.getAllWithdrawalRequests);
router.patch('/admin/change-status/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireRole)('superadmin'), bankaccount_controller_1.updateWithdrawalStatus);
router.get('/admin/stats', auth_middleware_1.authMiddleware, bankaccount_controller_1.getWithdrawalStats);
exports.default = router;
