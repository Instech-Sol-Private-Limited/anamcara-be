"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/profile', auth_middleware_1.authMiddleware, (req, res) => {
    res.status(200).json({
        success: true,
        data: req.user
    });
});
exports.default = router;
