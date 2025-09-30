"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitMiddleware = void 0;
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
const rateLimitMiddleware = (options) => {
    const { windowMs = 15 * 60 * 1000, max = 5, message = 'Too many requests, please try again later', statusCode = 429, keyGenerator = (req) => req.ip || 'unknown' } = options;
    const rateLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
        points: max,
        duration: windowMs / 1000,
    });
    // The proper middleware implementation
    return (req, res, next) => {
        const key = keyGenerator(req);
        rateLimiter.consume(key)
            .then((rateLimiterRes) => {
            res.set({
                'X-RateLimit-Limit': max,
                'X-RateLimit-Remaining': rateLimiterRes.remainingPoints,
                'X-RateLimit-Reset': Math.ceil(rateLimiterRes.msBeforeNext / 1000)
            });
            next();
        })
            .catch((error) => {
            if (error instanceof rate_limiter_flexible_1.RateLimiterRes) {
                res.set({
                    'X-RateLimit-Limit': max,
                    'X-RateLimit-Remaining': error.remainingPoints,
                    'X-RateLimit-Reset': Math.ceil(error.msBeforeNext / 1000),
                    'Retry-After': Math.ceil(error.msBeforeNext / 1000)
                });
                return res.status(statusCode).json({
                    success: false,
                    message,
                    retryAfter: Math.ceil(error.msBeforeNext / 1000)
                });
            }
            next(error);
        });
    };
};
exports.rateLimitMiddleware = rateLimitMiddleware;
