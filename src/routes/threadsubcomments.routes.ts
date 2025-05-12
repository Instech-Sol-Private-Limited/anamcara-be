import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { createSubComment, deleteSubComment, getSubcommentReactions, getSubComments, updateSubComment, updateSubCommentReaction } from '../controllers/threadsubcomments.controller';

const router = express.Router();

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
