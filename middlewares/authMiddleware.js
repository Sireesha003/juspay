// middlewares/authMiddleware.js 
import { prisma } from '../config/prismaClient.js';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import { getJwtVerifyOptions } from '../utils/jwtUtils.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseHelper.js';
import { patchAuditContext } from '../audit/auditContext.js';

// Constants for better maintainability
const AUTH_ERRORS = {
    NO_HEADER: 'No authorization header provided',
    NO_TOKEN: 'No token provided',
    INVALID_TOKEN: 'Invalid token',
    USER_NOT_FOUND: 'User not found or inactive',
    ADMIN_REQUIRED: 'Admin access required',
    SUPER_ADMIN_REQUIRED: 'Super Admin access required'
};

const ROLES = {
    USER: 'USER',
    ADMIN: 'ADMIN',
    SUPER_ADMIN: 'SUPER_ADMIN'
};

// Token cache to reduce database calls (optional - implement based on your caching strategy)
const tokenCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const authMiddleware = async (req, res, next) => {
    const startTime = Date.now();
    
    try {
        // Extract and validate authorization header
        const authHeader = req.header('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('Authentication failed - invalid authorization header format', {
                ip: req.ip,
                path: req.path,
                method: req.method,
                userAgent: req.get('user-agent'),
                hasHeader: !!authHeader
            });
            return errorResponse(res, 401, AUTH_ERRORS.NO_HEADER);
        }

        const token = authHeader.split(' ')[1];

        if (!token || token.length < 10) { // Basic token length validation
            logger.warn('Authentication failed - invalid token format', {
                ip: req.ip,
                path: req.path,
                method: req.method,
                tokenLength: token?.length || 0
            });
            return errorResponse(res, 401, AUTH_ERRORS.NO_TOKEN);
        }

        logger.debug('Token verification initiated', {
            ip: req.ip,
            path: req.path,
            tokenLength: token.length,
            tokenPrefix: token.substring(0, 10) + '...'
        });

        // Verify JWT token (issuer/audience only if set in config — must match jwtUtils.sign)
        const decoded = jwt.verify(token, config.jwt.publicKey, getJwtVerifyOptions());

        // Validate required token claims
        if (!decoded.id || !decoded.role) {
            logger.warn('Authentication failed - incomplete token claims', {
                hasId: !!decoded.id,
                hasRole: !!decoded.role,
                ip: req.ip,
                path: req.path
            });
            return errorResponse(res, 401, AUTH_ERRORS.INVALID_TOKEN);
        }

        // Check cache first (optional optimization)
        const cacheKey = `user_${decoded.id}`;
        const cachedUser = tokenCache.get(cacheKey);
        
        let user;
        if (cachedUser && (Date.now() - cachedUser.timestamp) < CACHE_DURATION) {
            user = cachedUser.user;
            logger.debug('User retrieved from cache', { userId: decoded.id });
        } else {
            // Fetch user from database
            user = await prisma.user.findFirst({
                where: { 
                    id: decoded.id, 
                    isActive: true 
                },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    isActive: true,
                    // lastLoginAt: true
                }
            });

            if (user) {
                // Cache the user data
                tokenCache.set(cacheKey, {
                    user,
                    timestamp: Date.now()
                });
            }
        }

        if (!user) {
            logger.warn('Authentication failed - user not found or inactive', {
                userId: decoded.id,
                ip: req.ip,
                path: req.path,
                decodedRole: decoded.role
            });
            return errorResponse(res, 401, AUTH_ERRORS.USER_NOT_FOUND);
        }

        // Verify role consistency between token and database (normalizing USER and CONSUMER)
        const normalizeRole = (r) => (r === 'USER' || r === 'CONSUMER' ? 'CONSUMER' : r);
        if (normalizeRole(user.role) !== normalizeRole(decoded.role)) {
            logger.warn('Authentication failed - role mismatch between token and database', {
                userId: user.id,
                tokenRole: decoded.role,
                dbRole: user.role,
                ip: req.ip,
                path: req.path
            });
            return errorResponse(res, 401, AUTH_ERRORS.INVALID_TOKEN);
        }

        const authDuration = Date.now() - startTime;
        logger.debug('Authentication successful', {
            userId: user.id,
            email: user.email,
            role: user.role,
            path: req.path,
            method: req.method,
            ip: req.ip,
            authDuration: `${authDuration}ms`,
            fromCache: !!cachedUser
        });

        // Attach user to request with additional context
        req.user = {
            ...user,
            tokenIat: decoded.iat,
            tokenExp: decoded.exp
        };

        patchAuditContext({
            actorId: user.id,
            actorRole: user.role
        });
        
        next();
        
    } catch (err) {
        const authDuration = Date.now() - startTime;
        
        if (err.name === 'JsonWebTokenError') {
            logger.warn('Authentication failed - invalid token format', {
                error: err.message,
                ip: req.ip,
                path: req.path,
                authDuration: `${authDuration}ms`
            });
        } else if (err.name === 'TokenExpiredError') {
            logger.warn('Authentication failed - token expired', {
                error: err.message,
                expiredAt: err.expiredAt,
                ip: req.ip,
                path: req.path,
                authDuration: `${authDuration}ms`
            });
        } else if (err.name === 'NotBeforeError') {
            logger.warn('Authentication failed - token not active yet', {
                error: err.message,
                date: err.date,
                ip: req.ip,
                path: req.path,
                authDuration: `${authDuration}ms`
            });
        } else {
            logger.error('Authentication error - unexpected error', {
                error: err.message,
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
                ip: req.ip,
                path: req.path,
                authDuration: `${authDuration}ms`
            });
        }
        
        return errorResponse(res, 401, AUTH_ERRORS.INVALID_TOKEN);
    }
};

// Role-based middleware factory
export const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            logger.warn('Role middleware - no user found in request', {
                requiredRoles: allowedRoles,
                ip: req.ip,
                path: req.path
            });
            return errorResponse(res, 403, 'Authentication required');
        }

        if (!allowedRoles.includes(req.user.role)) {
            logger.warn('Access denied - insufficient permissions', {
                userId: req.user.id,
                userRole: req.user.role,
                requiredRoles: allowedRoles,
                ip: req.ip,
                path: req.path
            });
            return errorResponse(res, 403, 'Insufficient permissions');
        }

        logger.debug('Role-based access granted', {
            userId: req.user.id,
            role: req.user.role,
            allowedRoles,
            path: req.path
        });

        next();
    };
};

// Simplified admin middleware using the factory
export const adminMiddleware = requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN);

// Simplified super admin middleware using the factory
export const superAdminMiddleware = requireRole(ROLES.SUPER_ADMIN);

// Optional: Middleware to check token freshness
export const requireFreshToken = (maxAgeInSeconds = 3600) => {
    return (req, res, next) => {
        if (!req.user || !req.user.tokenIat) {
            return errorResponse(res, 401, 'Token information unavailable');
        }

        const tokenAge = Date.now() / 1000 - req.user.tokenIat;
        
        if (tokenAge > maxAgeInSeconds) {
            logger.warn('Token too old for sensitive operation', {
                userId: req.user.id,
                tokenAge: Math.round(tokenAge),
                maxAge: maxAgeInSeconds,
                ip: req.ip,
                path: req.path
            });
            return errorResponse(res, 401, 'Token too old, please re-authenticate');
        }

        next();
    };
};

// Cleanup function for token cache (call periodically)
export const cleanupTokenCache = () => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, value] of tokenCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            tokenCache.delete(key);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        logger.debug('Token cache cleanup completed', { 
            cleanedEntries: cleanedCount,
            remainingEntries: tokenCache.size 
        });
    }
};

// Set up periodic cache cleanup (call this once in your app startup)
export const initializeAuthMiddleware = () => {
    setInterval(cleanupTokenCache, CACHE_DURATION);
    logger.info('Authentication middleware initialized with periodic cache cleanup');
};  