import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
    addNewCategory,
    getAllCategories,
    removeCategory,
    toggleCategoryStatus,
    updateCategory
} from '../controllers/threadcatgory.controller';

const router = express.Router();

// get all categories
router.get('/get-all-categories', getAllCategories);

// add new category
router.post('/create-category', authMiddleware, addNewCategory);

// update category
router.put('/update-category/:id', authMiddleware, updateCategory);

// delete category
router.delete('/delete-category/:id', authMiddleware, removeCategory);

// update active/inactive status
router.put('/toggle-category-status/:id', authMiddleware, toggleCategoryStatus);

export default router;
