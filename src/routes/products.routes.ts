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
const router = express.Router();

router.post('/create-asset', createDigitalAsset);

router.get('/marketplace', getApprovedProducts);

router.get('/get-asset-details/:id', getProductDetails);

router.get('/get-user-assets/:userId', getProductsByUser);

router.put('/update-asset/:id', updateProduct);

router.get('/admin/all', getAllProductsForAdmin);

router.put('/admin/update/:id', updateProduct);

router.delete('/delete-asset/:id', deleteProduct);


// -------------- Product purchase Route --------------
router.post('/purchase', processPurchase);

router.get('/my-library', getMyLibraryProducts);

router.post('/resale/initiate', initiateResale);

router.post('/resale/complete', completeResale);



// -------------- Product review and rating Route --------------
router.get('/get-product-reviews/:productId', getProductReviews);

router.get('/get-user-reviews', getUserReviews);


router.post(
  '/create-review/:productId/review',
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
  rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many votes, please try again later',
    keyGenerator: (req) => `review_vote:${req.params.reviewId}:${req.user?.id || req.ip}`
  }),
  voteOnReview
);


// -------------- Product boost and promotion Route --------------
router.post('/boost/create', createBoost);

router.get('/get-featured-products', getActiveFeaturedProducts);

// admin route
router.get('/boost/active/:productId', getActiveBoosts);

router.get('/boost/user-boosts', getUserBoosts);

export default router;

