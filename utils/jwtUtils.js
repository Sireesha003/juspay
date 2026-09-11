import jwt from 'jsonwebtoken';
import config from '../config/config.js';

/** Options for jwt.verify — only pass issuer/audience when configured (avoids verify/sign drift). */
export function getJwtVerifyOptions() {
    const opts = {
        algorithms: [config.jwt.algorithm],
    };
    if (config.jwt.issuer) opts.issuer = config.jwt.issuer;
    if (config.jwt.audience) opts.audience = config.jwt.audience;
    return opts;
}

const generateToken = (payload, expiresIn = null) => {
    const signOpts = {
        expiresIn: expiresIn || config.jwt.expiresIn,
        algorithm: config.jwt.algorithm,
    };
    if (config.jwt.issuer) signOpts.issuer = config.jwt.issuer;
    if (config.jwt.audience) signOpts.audience = config.jwt.audience;
    return jwt.sign(payload, config.jwt.privateKey, signOpts);
};

// Generate token for consumer/user
export const generateUserToken = (user) => {
    return generateToken({
        id: user.id,
        phone: user.phone,
        role: user.role || 'CONSUMER',
    });
};

// Generate refresh token (longer expiry)
export const generateRefreshToken = (user) => {
    return generateToken({
        id: user.id,
        phone: user.phone,
        role: user.role || 'CONSUMER',
        type: 'refresh',
    }, '30d'); // Refresh token valid for 30 days
};

// Generate token for admin
export const generateAdminToken = (admin) => {
    return generateToken({
        id: admin.id,
        phone: admin.phone,
        role: admin.role,
        type: 'admin',
    });
};

// Verify token (same rules as authMiddleware)
export const verifyToken = (token) => {
    return jwt.verify(token, config.jwt.publicKey, getJwtVerifyOptions());
}; 