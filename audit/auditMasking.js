const SENSITIVE_KEYS = new Set([
  'password',
  'otp',
  'otphash',
  'token',
  'authorization',
  'refreshtoken',
  'razorpaysignature',
  'cardnumber',
  'cvv',
  'upi',
  'email',
  'phone'
])

function maskValue(key, value) {
  const lowered = key.toLowerCase()
  if (!SENSITIVE_KEYS.has(lowered)) return value
  if (value == null) return value

  if (lowered === 'email') {
    const parts = String(value).split('@')
    if (parts.length !== 2) return '***'
    return `${parts[0].slice(0, 2)}***@${parts[1]}`
  }

  if (lowered === 'phone') {
    const str = String(value)
    return str.length > 4 ? `******${str.slice(-4)}` : '***'
  }

  return '***'
}

export function maskSensitiveData(input) {
  if (input === null || input === undefined) return input
  if (Array.isArray(input)) return input.map(maskSensitiveData)
  if (typeof input !== 'object') return input

  const out = {}
  for (const [key, value] of Object.entries(input)) {
    if (value && typeof value === 'object') {
      out[key] = maskSensitiveData(value)
      continue
    }
    out[key] = maskValue(key, value)
  }
  return out
}

