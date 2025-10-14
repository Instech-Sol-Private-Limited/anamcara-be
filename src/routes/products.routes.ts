import express from 'express';

import {
  createDigitalAsset,
  getProductsByUser,
  getApprovedProducts,
  getAllProductsForAdmin,
  getProductDetails,
  updateProduct,
  deleteProduct,
  processPurchase,
  getMyLibraryProducts,
  initiateResale,
  completeResale,
  getProductReviews,
  getUserReviews,
  createReview,
  updateReview,
  deleteReview,
  voteOnReview,
  createBoost,
  getActiveBoosts,
  getUserBoosts,
  getActiveFeaturedProducts
} from '../controllers/products.controller';
import { rateLimitMiddleware } from '../middleware/ratelimit.middleware';
import { authMiddleware } from '../middleware/auth.middleware';
const router = express.Router();

router.post('/create-asset', authMiddleware, createDigitalAsset);

router.get('/marketplace', getApprovedProducts);

router.get('/get-asset-details/:id', getProductDetails);

router.get('/get-user-assets/:userId', authMiddleware, getProductsByUser);

router.put('/update-asset/:id', authMiddleware, updateProduct);

router.get('/admin/all', authMiddleware, getAllProductsForAdmin);

router.put('/admin/update/:id', authMiddleware, updateProduct);

router.delete('/delete-asset/:id', authMiddleware, deleteProduct);


// -------------- Product purchase Route --------------
router.post('/purchase', authMiddleware, processPurchase);

router.get('/my-library', authMiddleware, getMyLibraryProducts);

router.post('/resale/initiate', authMiddleware, initiateResale);

router.post('/resale/complete', authMiddleware, completeResale);



// -------------- Product review and rating Route --------------
router.get('/get-product-reviews/:productId', getProductReviews);

router.get('/get-user-reviews', authMiddleware, getUserReviews);


router.post(
  '/create-review/:productId/review',
  authMiddleware,
  rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many review submissions, please try again later',
    keyGenerator: (req) => `review_create:${req.user?.id || req.ip}`
  }),
  createReview
);

router.put(
  '/update-review/:reviewId',
  authMiddleware,
  rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many review updates, please try again later',
    keyGenerator: (req) => `review_update:${req.user?.id || req.ip}`
  }),
  updateReview
);

router.delete(
  '/delete-review/:reviewId',
  authMiddleware,
  rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many review deletions, please try again later',
    keyGenerator: (req) => `review_delete:${req.user?.id || req.ip}`
  }),
  deleteReview
);

router.post(
  '/review/:reviewId/vote',
  authMiddleware,
  rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many votes, please try again later',
    keyGenerator: (req) => `review_vote:${req.params.reviewId}:${req.user?.id || req.ip}`
  }),
  voteOnReview
);


// -------------- Product boost and promotion Route --------------
router.post('/boost/create', authMiddleware, createBoost);

router.get('/get-featured-products', getActiveFeaturedProducts);

// admin route
router.get('/boost/active/:productId', authMiddleware, getActiveBoosts);

router.get('/boost/user-boosts', authMiddleware, getUserBoosts);

export default router;

