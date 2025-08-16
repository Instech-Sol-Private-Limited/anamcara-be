import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { Request, Response, NextFunction, RequestHandler } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  statusCode?: number;
  keyGenerator?: (req: Request) => string;
}

export const rateLimitMiddleware = (options: RateLimitOptions): RequestHandler => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 5,
    message = 'Too many requests, please try again later',
    statusCode = 429,
    keyGenerator = (req) => req.ip || 'unknown'
  } = options;

  const rateLimiter = new RateLimiterMemory({
    points: max,
    duration: windowMs / 1000,
  });

  // The proper middleware implementation
  return (req: Request, res: Response, next: NextFunction) => {
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
        if (error instanceof RateLimiterRes) {
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