"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/blogRoutes.ts
const express_1 = __importDefault(require("express"));
const blogController_1 = require("../controllers/blogController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.get('/', blogController_1.getAllBlogs);
router.get('/:id', blogController_1.getBlogById);
router.post('/', auth_middleware_1.authMiddleware, blogController_1.createBlog);
router.put('/:id', auth_middleware_1.authMiddleware, blogController_1.updateBlog);
router.delete('/:id', auth_middleware_1.authMiddleware, blogController_1.deleteBlog);
router.post('/:id/like', auth_middleware_1.authMiddleware, blogController_1.likeUnlikeBlog);
router.post('/:id/bookmark', auth_middleware_1.authMiddleware, blogController_1.bookmarkUnbookmarkBlog);
router.post('/:id/comment', auth_middleware_1.authMiddleware, blogController_1.addComment);
exports.default = router;
