import express from 'express';
import {
    createThread,
    deleteThread,
    updateThread,
    getThreadDetails,
    getAllThreads,
    updateReaction,
    getThreadsByUserId,
    toggleThreadStatus,
    updateVote,
} from '../controllers/threads/threads.controller';
import {
    createComment,
    deleteComment,
    getComments,
    updateComment,
    updateCommentReaction,
    updateCommentsVote,
} from '../controllers/threads/comments.controller';
import {
    createReply,
    deleteReply,
    getReplies,
    updateReply,
    updateReplyReaction,
} from '../controllers/threads/replies.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
import { createSpamThread, deleteSpamThread, getSpammedThreads } from '../controllers/threads/spam.controller';

const router = express.Router();


// ======================= threads ========================

// get all threads(range)
router.get('/get-all-threads', optionalAuthMiddleware, getAllThreads);

// create a new thread
router.post('/create-thread', authMiddleware, createThread);

// get thread details
router.get('/get-thread-details/:thread_id', optionalAuthMiddleware, getThreadDetails);

// update thread
router.put('/update-thread/:thread_id', authMiddleware, updateThread);

// delete thread
router.delete('/delete-thread/:thread_id', authMiddleware, deleteThread);

// handle like/ dislike
router.patch('/apply-react/:thread_id', authMiddleware, updateReaction);

router.get('/get-threads-by-user/:user_id', optionalAuthMiddleware, getThreadsByUserId);

router.patch('/toggle-status/:thread_id', authMiddleware, toggleThreadStatus);

router.post('/votes/:targetId', authMiddleware, updateVote);



// ======================= thread's comments ========================

// get all comments(range)
router.get('/get-comments', optionalAuthMiddleware, getComments);

// create a new comment
router.post('/add-comment', authMiddleware, createComment);

// update comment
router.put('/update-comment/:comment_id', authMiddleware, updateComment);

// delete comment
router.delete('/delete-comment/:comment_id', authMiddleware, deleteComment);

// handle like/ dislike
router.patch('/apply-comment-react/:comment_id', authMiddleware, updateCommentReaction);


router.post('/comments/:targetId/vote', authMiddleware, updateCommentsVote);


// ======================= comment's replies ========================

// get all comments(range)
router.get('/get-replies/:comment_id', optionalAuthMiddleware, getReplies);

// create a new comment
router.post('/add-reply', authMiddleware, createReply);

// update comment
router.put('/update-reply/:reply_id', authMiddleware, updateReply);

// delete comment
router.delete('/delete-reply/:reply_id', authMiddleware, deleteReply);

// handle like/ dislike
router.patch('/apply-reply-react/:reply_id', authMiddleware, updateReplyReaction);

router.post('/subcomments/:targetId/vote', authMiddleware, updateCommentsVote);


// ======================= Threads Spam ========================

// create spam thread
router.post('/create-spam-thread', authMiddleware, createSpamThread);

// remove spam comment
router.delete('/remove-spam-thread/:thread_id', authMiddleware, deleteSpamThread);

// remove spam comment
router.get('/get-spam-threads', authMiddleware, getSpammedThreads);

export default router;
