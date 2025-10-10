"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const products_controller_1 = require("../controllers/products.controller");
const ratelimit_middleware_1 = require("../middleware/ratelimit.middleware");
const router = express_1.default.Router();
router.post('/create-asset', products_controller_1.createDigitalAsset);
router.get('/marketplace', products_controller_1.getApprovedProducts);
router.get('/get-asset-details/:id', products_controller_1.getProductDetails);
router.get('/get-user-assets/:userId', products_controller_1.getProductsByUser);
router.put('/update-asset/:id', products_controller_1.updateProduct);
router.get('/admin/all', products_controller_1.getAllProductsForAdmin);
router.put('/admin/update/:id', products_controller_1.updateProduct);
router.delete('/delete-asset/:id', products_controller_1.deleteProduct);
// -------------- Product purchase Route --------------
router.post('/purchase', products_controller_1.processPurchase);
router.get('/my-library', products_controller_1.getMyLibraryProducts);
router.post('/resale/initiate', products_controller_1.initiateResale);
router.post('/resale/complete', products_controller_1.completeResale);
// -------------- Product review and rating Route --------------
router.get('/get-product-reviews/:productId', products_controller_1.getProductReviews);
router.get('/get-user-reviews', products_controller_1.getUserReviews);
router.post('/create-review/:productId/review', (0, ratelimit_middleware_1.rateLimitMiddleware)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many review submissions, please try again later',
    keyGenerator: (req) => { var _a; return `review_create:${((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || req.ip}`; }
}), products_controller_1.createReview);
router.put('/update-review/:reviewId', (0, ratelimit_middleware_1.rateLimitMiddleware)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many review updates, please try again later',
    keyGenerator: (req) => { var _a; return `review_update:${((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || req.ip}`; }
}), products_controller_1.updateReview);
router.delete('/delete-review/:reviewId', (0, ratelimit_middleware_1.rateLimitMiddleware)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many review deletions, please try again later',
    keyGenerator: (req) => { var _a; return `review_delete:${((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || req.ip}`; }
}), products_controller_1.deleteReview);
router.post('/review/:reviewId/vote', (0, ratelimit_middleware_1.rateLimitMiddleware)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many votes, please try again later',
    keyGenerator: (req) => { var _a; return `review_vote:${req.params.reviewId}:${((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || req.ip}`; }
}), products_controller_1.voteOnReview);
// -------------- Product boost and promotion Route --------------
router.post('/boost/create', products_controller_1.createBoost);
router.get('/get-featured-products', products_controller_1.getActiveFeaturedProducts);
// admin route
router.get('/boost/active/:productId', products_controller_1.getActiveBoosts);
router.get('/boost/user-boosts', products_controller_1.getUserBoosts);
exports.default = router;
