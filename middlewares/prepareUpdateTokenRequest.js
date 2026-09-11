import crypto from 'crypto'

/**
 * When a valid Bearer JWT was attached by optionalAuth, bind userId from the token
 * so clients may send only { deviceToken } (and optional metadata).
 */
export const applyJwtUserIdToUpdateTokenBody = (req, res, next) => {
  if (req.user?.id) {
    req.body.userId = req.user.id
  }
  next()
}

/**
 * deviceMetadata is keyed by (userId, deviceId). If the client omits deviceId
 * (common for FCM-only flows), derive a stable id from the FCM token string.
 */
export const deriveDeviceIdForUpdateTokenIfMissing = (req, res, next) => {
  const rawToken = typeof req.body?.deviceToken === 'string' ? req.body.deviceToken.trim() : ''
  const rawDeviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : ''
  if (!rawDeviceId && rawToken) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex').slice(0, 40)
    req.body.deviceId = `fcm_${hash}`
  }
  next()
}
