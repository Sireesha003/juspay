import fs from 'fs'
import path from 'path'
import admin from 'firebase-admin'
import logger from '../utils/logger.js'

let firebaseInitialized = false

function stripBom(s) {
  return String(s).replace(/^\uFEFF/, '')
}

/** PEM in env/secrets often stores newlines as the two-char sequence \n */
function normalizePrivateKey(obj) {
  if (obj && typeof obj.private_key === 'string') {
    obj.private_key = obj.private_key.replace(/\\n/g, '\n')
  }
  return obj
}

/**
 * Parse service-account JSON from a raw string (file contents or env value).
 * Handles: BOM, JSON-as-string (double-encoded), base64-wrapped JSON (Secrets Manager pattern).
 */
function parseServiceAccountJson(raw) {
  let s = stripBom(String(raw).trim())

  let parsed
  try {
    parsed = JSON.parse(s)
  } catch {
    const decoded = Buffer.from(s, 'base64').toString('utf8')
    parsed = JSON.parse(stripBom(decoded.trim()))
  }

  if (typeof parsed === 'string') {
    parsed = JSON.parse(stripBom(parsed.trim()))
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Service account value must decode to a JSON object')
  }

  return normalizePrivateKey(parsed)
}

/** Inline env: optional outer quotes + escapes from SSM / console paste */
function parseInlineServiceAccount(raw) {
  let s = stripBom(String(raw).trim())

  if (
    (s.startsWith('"') && s.endsWith('"') && s.length > 1) ||
    (s.startsWith("'") && s.endsWith("'") && s.length > 1)
  ) {
    s = s.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'")
  }

  return parseServiceAccountJson(s)
}

function loadFromFile(filePath) {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Credentials file not found: ${resolved}`)
  }
  const raw = fs.readFileSync(resolved, 'utf8')
  return parseServiceAccountJson(raw)
}

function initFirebase() {
  if (admin.apps.length > 0) {
    firebaseInitialized = true
    logger.info('[Firebase] Already initialized (existing app)', {
      firebaseInitialized: true
    })
    return
  }

  const fileEnv = process.env.FIREBASE_SERVICE_ACCOUNT_FILE
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT

  try {
    if (fileEnv) {
      const resolved = path.resolve(fileEnv)
      const creds = loadFromFile(fileEnv)
      admin.initializeApp({ credential: admin.credential.cert(creds) })
      firebaseInitialized = true
      logger.info('[Firebase] Firebase Admin initialized', {
        firebaseInitialized: true,
        credentialSource: 'FIREBASE_SERVICE_ACCOUNT_FILE',
        credentialsPath: resolved,
        projectId: creds.project_id
      })
      return
    }

    if (gac) {
      const resolved = path.resolve(gac)
      if (fs.existsSync(resolved)) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault()
        })
        firebaseInitialized = true
        logger.info('[Firebase] Firebase Admin initialized', {
          firebaseInitialized: true,
          credentialSource: 'GOOGLE_APPLICATION_CREDENTIALS',
          credentialsPath: resolved
        })
        return
      }
      firebaseInitialized = false
      logger.warn('[Firebase] GOOGLE_APPLICATION_CREDENTIALS set but file missing', {
        firebaseInitialized: false,
        credentialsPath: resolved
      })
      logger.warn('[Firebase] Push notifications disabled until credentials path is valid')
      if (!inline) return
    }

    if (inline) {
      const creds = parseInlineServiceAccount(inline)
      admin.initializeApp({ credential: admin.credential.cert(creds) })
      firebaseInitialized = true
      logger.info('[Firebase] Firebase Admin initialized', {
        firebaseInitialized: true,
        credentialSource: 'FIREBASE_SERVICE_ACCOUNT',
        projectId: creds.project_id
      })
      return
    }

    firebaseInitialized = false
    if (!fileEnv && !gac && !inline) {
      logger.warn('[Firebase] No credentials configured', {
        firebaseInitialized: false,
        hint:
          'Set FIREBASE_SERVICE_ACCOUNT_FILE, GOOGLE_APPLICATION_CREDENTIALS, or FIREBASE_SERVICE_ACCOUNT'
      })
    } else {
      logger.warn('[Firebase] Push disabled — credential env set but not usable', {
        firebaseInitialized: false,
        FIREBASE_SERVICE_ACCOUNT_FILE: fileEnv || undefined,
        GOOGLE_APPLICATION_CREDENTIALS: gac || undefined,
        FIREBASE_SERVICE_ACCOUNT: inline ? '(set)' : undefined
      })
    }
    logger.warn('[Firebase] Push notifications will not be available')
  } catch (error) {
    firebaseInitialized = false
    logger.warn('[Firebase] Initialization failed', {
      firebaseInitialized: false,
      error: error.message
    })
    logger.warn('[Firebase] Push notifications will not be available')
    logger.warn(
      '[Firebase] AWS tip: mount JSON from Secrets Manager and set FIREBASE_SERVICE_ACCOUNT_FILE, or use base64 in FIREBASE_SERVICE_ACCOUNT'
    )
  }
}

initFirebase()

export { admin, firebaseInitialized }
