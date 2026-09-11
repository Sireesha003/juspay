// middlewares/rateLimitMiddleware.js 
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';
import config from '../config/config.js';
import { errorResponse } from '../utils/responseHelper.js';

const rateLimitMiddleware = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
      maxRequests: options.max,
      windowMs: options.windowMs,
      timestamp: new Date().toISOString()
    });

    return errorResponse(res, 429, `Too many requests, please try again later. Retry after ${Math.round(options.windowMs / 1000)} seconds.`);

  },

  requestWasLimited: (req, res, options) => {
    logger.info('Rate limit threshold reached', {
      ip: req.ip,
      userId: req.user?.id,
      path: req.path,
      maxRequests: options.max,
      windowMs: options.windowMs,
      timestamp: new Date().toISOString()
    });
  },

  skip: (req) => {
    return req.path === '/check' || req.path === '/health';
  },

  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  }
});

export default rateLimitMiddleware;
