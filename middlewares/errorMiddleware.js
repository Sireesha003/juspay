// middlewares/errorMiddleware.js 
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseHelper.js';

export const errorMiddleware = (err, req, res, next) => {
    const startTime = Date.now();
    
    // Determine status code and message
    let statusCode = err.status || err.statusCode || 500;
    let message = err.message || 'Internal server error';

    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation failed';
        logger.warn('Validation error details', {
            validationErrors: err.errors,
            userId: req.user?.id,
            path: req.path
        });
    }

    if (err.name === 'CastError') {
        statusCode = 400;
        message = 'Invalid data format';
        logger.warn('Database cast error', {
            kind: err.kind,
            value: err.value,
            path: err.path
        });
    }

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Authentication failed';
    }

    // Handle Prisma errors
    if (err.name === 'PrismaClientKnownRequestError') {
        statusCode = 400;
        switch (err.code) {
            case 'P2002':
                message = 'Duplicate entry found';
                break;
            case 'P2025':
                statusCode = 404;
                message = 'Record not found';
                break;
            case 'P2003':
                message = 'Foreign key constraint failed';
                break;
            default:
                message = 'Database operation failed';
        }
        
        // Handle UUID validation errors
        if (err.message && err.message.includes('Error creating UUID')) {
            statusCode = 400;
            message = 'Invalid ID format. Expected a valid UUID.';
        }
    }

    // Sanitize message for production
    if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
        message = 'Internal server error';
    }

    // Log the error with comprehensive context
    const logLevel = statusCode >= 500 ? 'error' : 'warn';
    logger[logLevel]('Request error occurred', {
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id,
        userRole: req.user?.role,
        statusCode,
        timestamp: new Date().toISOString(),
        requestBody: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        userAgent: req.get('user-agent'),
        referer: req.get('referer'),
        processingTime: `${Date.now() - startTime}ms`
    });

    // Use the response helper for consistent format
    return errorResponse(res, statusCode, message);
};

// Async error handler wrapper
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// 404 Not Found middleware
export const notFoundMiddleware = (req, res, next) => {
    logger.warn('Route not found', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString()
    });

    return errorResponse(res, 404, `Route ${req.method} ${req.path} not found`);
};
  