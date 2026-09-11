// utils/logger.js
import winston from 'winston'
import 'winston-daily-rotate-file'
import path from 'path'
import fs from 'fs'

// Define log directories structure
const LOG_DIRS = {
  base: 'logs',
  error: 'logs/error',
  warn: 'logs/warn',
  info: 'logs/info',
  http: 'logs/http',
  debug: 'logs/debug',
  results: 'logs/results',
  exceptions: 'logs/exceptions'
}

// Create directories
Object.values(LOG_DIRS).forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
})

// Custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  result: 5
}

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
  result: 'cyan'
}

winston.addColors(colors)

// File format
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// Console format
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `${timestamp} ${level}: ${message}${metaStr}`
  })
)

// Create file transport
const createFileTransport = (level, directory, filename = '%DATE%.log') => {
  return new winston.transports.DailyRotateFile({
    filename: path.join(directory, filename),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    level,
    format: fileFormat
  })
}

// Main logger
const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || 'debug',
  transports: [
    // Console (development only)
    ...(process.env.NODE_ENV !== 'production12345'
      ? [
          new winston.transports.Console({
            format: consoleFormat,
            level: 'debug'
          })
        ]
      : []),

    // File transports - each level gets its own directory
    createFileTransport('error', LOG_DIRS.error),
    createFileTransport('warn', LOG_DIRS.warn),
    createFileTransport('info', LOG_DIRS.info),
    createFileTransport('http', LOG_DIRS.http),
    createFileTransport('debug', LOG_DIRS.debug),
    createFileTransport('result', LOG_DIRS.results, 'results-%DATE%.log')
  ],

  exceptionHandlers: [
    createFileTransport('error', LOG_DIRS.exceptions, 'exceptions-%DATE%.log')
  ],

  rejectionHandlers: [
    createFileTransport('error', LOG_DIRS.exceptions, 'rejections-%DATE%.log')
  ],

  exitOnError: false
})

// Helper function for result logging
export const logResult = (data, source, level = 'result') => {
  logger.log(level, `Result from ${source}`, {
    source,
    data: typeof data === 'object' ? data : { value: data },
    timestamp: new Date().toISOString()
  })
}

// Helper for HTTP logging
export const logRequest = (req, res, next) => {
  const start = Date.now()

  logger.http('Request received', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id
  })

  res.on('finish', () => {
    logger.http('Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${Date.now() - start}ms`,
      ip: req.ip,
      userId: req.user?.id
    })
  })

  next()
}

export default logger
