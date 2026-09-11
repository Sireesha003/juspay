//  config/prismaClient.js
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';
import { applyAuditPrismaExtension } from '../audit/auditPrismaExtension.js';
import { setAuditPrismaClient } from '../audit/prismaAccessor.js';

const basePrisma = new PrismaClient({
    log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' }
    ]
});

const prisma = applyAuditPrismaExtension(basePrisma);
setAuditPrismaClient(prisma);

// Enhanced Prisma event logging
basePrisma.$on('query', (e) => {
    logger.debug('Database query executed', {
        query: e.query,
        params: e.params,
        duration: `${e.duration}ms`,
        target: e.target
    });
});

basePrisma.$on('error', (e) => {
    logger.error('Database error occurred', {
        message: e.message,
        target: e.target
    });
});

basePrisma.$on('info', (e) => {
    logger.info('Database info', {
        message: e.message,
        target: e.target
    });
});

basePrisma.$on('warn', (e) => {
    logger.warn('Database warning', {
        message: e.message,
        target: e.target
    });
});

const connectPostGreSQL = async () => {
    try {
        await prisma.$connect();
        logger.info('Database connection established', {
            database: 'PostgreSQL',
            client: 'Prisma',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Database connection failed', {
            error: error.message,
            stack: error.stack,
            database: 'PostgreSQL'
        });
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT - disconnecting from database');
    await prisma.$disconnect();
    process.exit(0);
});

export { connectPostGreSQL, prisma };