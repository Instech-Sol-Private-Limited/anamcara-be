import { authMiddleware } from "../middleware/auth.middleware";
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
    updateWithdrawalStatus
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

router.get('/withdraw/stats', authMiddleware, getWithdrawalStats);

// Admin routes (add proper admin middleware)
router.patch('/admin/withdraw/:id/status', authMiddleware, updateWithdrawalStatus);

export default router;