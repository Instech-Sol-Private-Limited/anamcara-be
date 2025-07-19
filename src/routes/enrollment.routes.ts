import express from 'express';
import {
  createPaymentIntent,
  confirmEnrollment,
  getOrderSummary,
  checkEnrollment,
  getEnrolledCourses,
  validateCouponCode
} from '../controllers/courses/enrollment.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// All enrollment routes require authentication
router.use(authMiddleware);

// POST /api/enrollment/create-payment-intent
router.post('/create-payment-intent', createPaymentIntent);

// POST /api/enrollment/confirm
router.post('/confirm', confirmEnrollment);

// GET /api/enrollment/order-summary
router.get('/order-summary', getOrderSummary);

// GET /api/enrollment/check/:courseId
router.get('/check/:courseId', checkEnrollment);

// GET /api/enrollment/my-courses
router.get('/my-courses', getEnrolledCourses);

// POST /api/enrollment/validate-coupon
router.post('/validate-coupon', validateCouponCode);

export default router;
