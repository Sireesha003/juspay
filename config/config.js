// config/config.js
import fs from 'fs'
import { parseDuration } from '../utils/timeParser.js'
import { generateKeyPairSync } from 'crypto'
import { join } from 'path'

let privateKey = process.env.JWT_PRIVATE_KEY ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n') : null
let publicKey = process.env.JWT_PUBLIC_KEY ? process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n') : null

if (!privateKey || !publicKey) {
  const keysDir = join(process.cwd(), 'keys')
  const privateKeyPath = join(keysDir, 'private.key')
  const publicKeyPath = join(keysDir, 'public.key')

  try {
    if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
      if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true })
      }
      const pair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      })
      fs.writeFileSync(privateKeyPath, pair.privateKey)
      fs.writeFileSync(publicKeyPath, pair.publicKey)
      console.log('✅ Auto-generated RSA Keys in ./keys')
    }
    privateKey = fs.readFileSync(privateKeyPath, 'utf8')
    publicKey = fs.readFileSync(publicKeyPath, 'utf8')
  } catch (error) {
    console.error('❌ Error reading/generating JWT key files:', error.message)
    throw error
  }
}

export default {
  app: {
    name: 'VillagKart Consumer API',
    port: process.env.PORT || 3002,
    environment: process.env.NODE_ENV || 'development'
  },
  api: {
    version: 'v1',
    baseUrl: '/api',
    fullPrefix: '/api/v1'
  },
  jwt: {
    privateKey: privateKey,
    publicKey: publicKey,
    algorithm: 'RS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h', // previously 1 hr
    // Optional; only enforced when set. Must match signing (jwtUtils) on this API.
    // Use a consumer-specific audience (not delivery-api’s) if you enable these.
    issuer: process.env.JWT_ISSUER || undefined,
    audience: process.env.JWT_AUDIENCE || undefined
  },
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES) || 10,
    cooldownMinutes: parseInt(process.env.OTP_COOLDOWN_MINUTES) || 2,
    maxResends: parseInt(process.env.OTP_MAX_RESENDS) || 3,
    resendCooldownMinutes:
      parseInt(process.env.OTP_RESEND_COOLDOWN_MINUTES) || 1
  },
  rateLimit: {
    windowMs: parseDuration(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // default 15m
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100
  },
  // MSG91 Send SMS via Flow API — POST /api/v5/flow/ (flow_id + sender + VAR1/VAR2)
  // See https://api.msg91.com/apidoc/textsms/send-sms-flow.php
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY || '',
    // Flow ID from MSG91 SMS → Flow (may differ from DLT Template ID on the template screen)
    flowId:
      process.env.MSG91_FLOW_ID ||
      process.env.MSG91_TEMPLATE_ID ||
      '1707177332149216674',
    sender: process.env.MSG91_SENDER_ID || 'VLGKRT',
    // India DLT transactional OTP: route 4 is standard; override with MSG91_ROUTE, or set MSG91_ROUTE= to omit
    route:
      process.env.MSG91_ROUTE === ''
        ? undefined
        : (process.env.MSG91_ROUTE ?? '4'),
    // English SMS: 0 per MSG91 Flow API
    unicode:
      process.env.MSG91_UNICODE === ''
        ? undefined
        : (process.env.MSG91_UNICODE ?? '0')
  }
}
