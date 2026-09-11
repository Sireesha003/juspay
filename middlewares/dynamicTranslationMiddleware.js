import translate from '@iamtraction/google-translate';
import logger from '../utils/logger.js';

// In-memory cache to prevent spamming Google Translate API for common phrases
const translationCache = new Map();

const translateText = async (text, targetLang) => {
    if (!text || typeof text !== 'string') return text;
    
    const cacheKey = `${targetLang}:${text}`;
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }
    
    try {
        const res = await translate(text, { to: targetLang });
        translationCache.set(cacheKey, res.text);
        return res.text;
    } catch (err) {
        logger.error(`Dynamic Translation Error for "${text}": ${err.message}`);
        return text; // Fallback to original text on failure
    }
};

// Fields that contain user-facing text
const fieldsToTranslate = new Set([
    'message', 
    'response', 
    'name', 
    'description', 
    'categoryName', 
    'productName', 
    'bannerTitle', 
    'title', 
    'subtitle',
    'orderStatusLabel',
    'reason',
    'notes',
    'toStatus',
    'status',
    'fromStatus'
]);

const translateObject = async (obj, targetLang) => {
    if (!obj) return obj;
    
    if (Array.isArray(obj)) {
        return Promise.all(obj.map(item => translateObject(item, targetLang)));
    }
    
    if (typeof obj === 'object') {
        const result = { ...obj };
        for (const key of Object.keys(result)) {
            // Translate specific known text fields
            if (fieldsToTranslate.has(key) && typeof result[key] === 'string') {
                result[key] = await translateText(result[key], targetLang);
            } 
            // Recursively search nested objects (like data: { ... } or errors: [ ... ])
            // Skip traversing the 'address' object to keep it escaped from translation
            else if (key !== 'address' && typeof result[key] === 'object' && result[key] !== null) {
                result[key] = await translateObject(result[key], targetLang);
            }
        }
        return result;
    }
    
    return obj;
};

export const dynamicTranslationMiddleware = (req, res, next) => {
    const originalJson = res.json;

    // Override res.json
    res.json = function (body) {
        const lang = req.language || 'en';
        
        // If English or missing body, just send normally without translation overhead
        if (lang === 'en' || !body) {
            return originalJson.call(this, body);
        }

        // Translate asynchronously, then send
        translateObject(body, lang).then(translatedBody => {
            originalJson.call(this, translatedBody);
        }).catch(err => {
            logger.error(`Translation middleware failure: ${err.message}`);
            originalJson.call(this, body); // Fallback to english on critical failure
        });
        
        // Return this to maintain express chaining e.g. res.status(200).json(...)
        return this;
    };

    next();
};
