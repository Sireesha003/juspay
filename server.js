// server.js - Updated with enhanced logging CI/CD pipeline
// Load .env before any module that reads process.env (e.g. jobs → Firebase).
import 'dotenv/config'
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fileUpload from 'express-fileupload';
import { fileURLToPath } from 'url';
import path from 'path';

import { connectPostGreSQL, prisma } from './config/prismaClient.js';
import config from './config/config.js';
import rateLimitMiddleware from './middlewares/rateLimitMiddleware.js';
import requestContextMiddleware from './middlewares/requestContext.js';
import languageMiddleware from './middlewares/languageMiddleware.js';
import { dynamicTranslationMiddleware } from './middlewares/dynamicTranslationMiddleware.js';
import { errorMiddleware } from './middlewares/errorMiddleware.js';
import logger, { logRequest } from './utils/logger.js';
import { setupPrismaMiddleware } from './middlewares/prismaMiddleware.js';
import { initializeSocket } from './config/socket.js';
import './jobs/startJobProcessors.js'; // Start job processors
import './config/env.js';
import routes from './services/apiRoutes.js';
import { flushAuditOutboxNow, startAuditFlushWorker, stopAuditFlushWorker } from './audit/auditFlushWorker.js';
import { startIdempotencyCleanupWorker, stopIdempotencyCleanupWorker } from './services/idempotencyCleanupService.js';
import {
  startCreateOrderDeliveryMirrorRetryWorker,
  stopCreateOrderDeliveryMirrorRetryWorker
} from './services/createOrderDeliveryMirrorRetryService.js';
import { startOrderNotificationWorker, stopOrderNotificationWorker } from './queues/orderNotificationQueue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//Hello Ismail CI/CD test - Consumer
// Hello test again with Hari testing

const app = express();

// Core Middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(fileUpload({
    useTempFiles: false,
    parseNested: true,
    limits: { fileSize: 10 * 1024 * 1024 },
    abortOnLimit: true,
    safeFileNames: true,
    preserveExtension: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cors({
    credentials: true,
    origin: process.env.NODE_ENV === 'production' ? [process.env.FRONTEND_URL] : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'x-request-id',
        'x-idempotency-key',
        'x-audit-origin',
        'x-parent-event-id',
        'x-warehouse-id'
    ]
}));

// Enhanced logging middleware (replaces morgan)
app.use(logRequest);
app.use(requestContextMiddleware);
app.use(languageMiddleware);
app.use(dynamicTranslationMiddleware);
app.use(rateLimitMiddleware);
// app.use('/public', express.static(path.join(__dirname, 'public')));

// Routes
routes(app);
app.use(errorMiddleware);

app.use('*', (req, res) => {
    logger.warn('Route not found', {
        path: req.originalUrl,
        method: req.method,
        ip: req.ip
    });
    res.status(404).json({ success: false, message: 'Route not found' });
});
// Server Start
const PORT = process.env.PORT || config.app.port || 3002;

const startServer = async () => {
    try {
        await connectPostGreSQL();

        logger.info('Database connection established', { database: 'PostgreSQL' });

        // Setup Prisma middleware for automatic job triggering
        setupPrismaMiddleware();

        const server = app.listen(PORT, () => {
            logger.info('Server started successfully', {
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                appName: config.app.name,
                timestamp: new Date().toISOString()
            });
        });

        // Initialize Socket.io for real-time updates
        initializeSocket(server);
        startOrderNotificationWorker();
        startAuditFlushWorker();
        startIdempotencyCleanupWorker();
        startCreateOrderDeliveryMirrorRetryWorker();

        const gracefulShutdown = (signal) => {
            logger.warn('Shutdown signal received', { signal });
            server.close(async () => {
                try {
                    stopAuditFlushWorker();
                    stopIdempotencyCleanupWorker();
                    stopCreateOrderDeliveryMirrorRetryWorker();
                    await stopOrderNotificationWorker();
                    await flushAuditOutboxNow();
                    await prisma.$disconnect();
                    logger.info('Graceful shutdown completed', {
                        signal,
                        timestamp: new Date().toISOString()
                    });
                    process.exit(0);
                } catch (error) {
                    logger.error('Error during shutdown', {
                        error: error.message,
                        stack: error.stack
                    });
                    process.exit(1);
                }
            });
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        process.on('unhandledRejection', (error) => {
            logger.error('Unhandled promise rejection', {
                error: error.message,
                stack: error.stack,
                type: 'unhandledRejection'
            });
            gracefulShutdown('unhandledRejection');
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', {
                error: error.message,
                stack: error.stack,
                type: 'uncaughtException'
            });
            gracefulShutdown('uncaughtException');
        });

    } catch (error) {
        logger.error('Server startup failed', {
            error: error.message,
            stack: error.stack,
            port: PORT
        });
        process.exit(1);
    }
};

startServer();  