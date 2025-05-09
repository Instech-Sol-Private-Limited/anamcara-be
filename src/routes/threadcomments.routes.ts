import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { createComment, deleteComment, getComments, getCommentReactionsByThreadAndUser, updateComment, updateCommentReaction } from '../controllers/threadcomments.controller';

const router = express.Router();

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


export default router;
