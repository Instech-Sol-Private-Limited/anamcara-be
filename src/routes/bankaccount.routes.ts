import { authMiddleware, requireRole, superAdminMiddleware } from "../middleware/auth.middleware";
import express from 'express';
import {
    getUserBankAccounts,
    createBankAccount,
    deleteBankAccount,
    setPrimaryBankAccount,
    getPrimaryBankAccount,
    createWithdrawalRequest,
    getWithdrawalRequests,
    getWithdrawalRequestById,
    cancelWithdrawalRequest,
    getWithdrawalStats,
    updateWithdrawalStatus,
    getAllWithdrawalRequests
} from '../controllers/bankaccount.controller';

const router = express.Router();

// Bank Account Routes
router.get('/', authMiddleware, getUserBankAccounts);

router.get('/primary', authMiddleware, getPrimaryBankAccount);

router.post('/', authMiddleware, createBankAccount);

router.delete('/:id', authMiddleware, deleteBankAccount);

router.patch('/:id/set-primary', authMiddleware, setPrimaryBankAccount);

// Withdrawal Routes
router.post('/withdraw-request', authMiddleware, createWithdrawalRequest);

router.get('/withdrawal-history', authMiddleware, getWithdrawalRequests);

router.get('/withdraw/history/:id', authMiddleware, getWithdrawalRequestById);

router.patch('/withdraw/history/:id/cancel', authMiddleware, cancelWithdrawalRequest);


// admin routes
router.get('/admin/all', authMiddleware, requireRole('superadmin'), getAllWithdrawalRequests);

router.patch('/admin/change-status/:id', authMiddleware, requireRole('superadmin'), updateWithdrawalStatus);

router.get('/admin/stats', authMiddleware, getWithdrawalStats);

export default router;