"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const threadcatgory_controller_1 = require("../controllers/threadcatgory.controller");
const router = express_1.default.Router();
// get all categories
router.get('/get-all-categories', threadcatgory_controller_1.getAllCategories);
// add new category
router.post('/create-category', auth_middleware_1.authMiddleware, threadcatgory_controller_1.addNewCategory);
// update category
router.put('/update-category/:id', auth_middleware_1.authMiddleware, threadcatgory_controller_1.updateCategory);
// delete category
router.delete('/delete-category/:id', auth_middleware_1.authMiddleware, threadcatgory_controller_1.removeCategory);
// update active/inactive status
router.put('/toggle-category-status/:id', auth_middleware_1.authMiddleware, threadcatgory_controller_1.toggleCategoryStatus);
exports.default = router;
