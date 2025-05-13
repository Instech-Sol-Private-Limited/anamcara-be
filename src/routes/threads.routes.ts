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
} from '../controllers/threads/threads.controller';
import {
    createComment,
    deleteComment,
    getComments,
    getCommentReactionsByThreadAndUser,
    updateComment,
    updateCommentReaction,
} from '../controllers/threads/threadcomments.controller';
import {
    createSubComment,
    deleteSubComment,
    getSubcommentReactions,
    getSubComments,
    updateSubComment,
    updateSubCommentReaction,
} from '../controllers/threads/replies.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();


// ======================= threads ========================

// get all threads(range)
router.get('/get-all-threads', getAllThreads);

// create a new thread
router.post('/create-thread', authMiddleware, createThread);

// get thread details
router.get('/get-thread-details/:thread_id', getThreadDetails);

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







// ======================= thread's comments ========================

// get all comments(range)
router.get('/get-comments/:thread_id', getComments);

// create a new comment
router.post('/add-comment', authMiddleware, createComment);

// update comment
router.put('/update-comment/:comment_id', authMiddleware, updateComment);

// delete comment
router.delete('/delete-comment/:comment_id', authMiddleware, deleteComment);

// handle like/ dislike
router.patch('/apply-comment-react/:comment_id', authMiddleware, updateCommentReaction);

// get user's comments reaction by thread
router.get('/get-all-comment-reaction/:thread_id', authMiddleware, getCommentReactionsByThreadAndUser);






// ======================= comment's replies ========================

// get all comments(range)
router.get('/get-replies/:comment_id', getSubComments);

// create a new comment
router.post('/add-reply/:comment_id', authMiddleware, createSubComment);

// update comment
router.put('/update-reply/:comment_id', authMiddleware, updateSubComment);

// delete comment
router.delete('/delete-reply/:comment_id', authMiddleware, deleteSubComment);

// handle like/ dislike
router.patch('/apply-reply-react/:comment_id', authMiddleware, updateSubCommentReaction);

// get user's comments reaction by thread
router.get('/get-reply-reaction/:comment_id', authMiddleware, getSubcommentReactions);


export default router;
