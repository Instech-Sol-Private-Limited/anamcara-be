import express from 'express';
import {
    createThread,
    deleteThread,
    updateThread,
    getThreadDetails,
    getAllThreads,
    updateReaction,
    getAllReactionsByUser,
    getThreadReaction
} from '../controllers/threads.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// get all threads(range)
router.get('/get-all-threads', getAllThreads);

// create a new thread
router.post('/create-thread', authMiddleware, createThread);

// get thread details
router.get('/get-thread-details/:thread_id', authMiddleware, getThreadDetails);

// update thread
router.put('/update-thread/:thread_id', authMiddleware, updateThread);

// delete thread
router.delete('/delete-thread/:thread_id', authMiddleware, deleteThread);

// handle like/ dislike
router.patch('/apply-react/:thread_id', authMiddleware, updateReaction);

// get user reaction by thread
router.get('/get-user-reaction/:thread_id', authMiddleware, getThreadReaction);

// get all thread user reaction
router.get('/get-all-user-reactions', authMiddleware, getAllReactionsByUser);

export default router;
