"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const enrollment_controller_1 = require("../controllers/courses/enrollment.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// All enrollment routes require authentication
router.use(auth_middleware_1.authMiddleware);
// POST /api/enrollment/create-payment-intent
router.post('/create-payment-intent', enrollment_controller_1.createPaymentIntent);
// POST /api/enrollment/confirm
router.post('/confirm', enrollment_controller_1.confirmEnrollment);
// GET /api/enrollment/order-summary
router.get('/order-summary', enrollment_controller_1.getOrderSummary);
// GET /api/enrollment/check/:courseId
router.get('/check/:courseId', enrollment_controller_1.checkEnrollment);
// GET /api/enrollment/my-courses
router.get('/my-courses', enrollment_controller_1.getEnrolledCourses);
// POST /api/enrollment/validate-coupon
router.post('/validate-coupon', enrollment_controller_1.validateCouponCode);
exports.default = router;
