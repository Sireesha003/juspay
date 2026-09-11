import config from '../config/config.js';

export const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

export const calculateOtpExpiry = () => {
    return new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);
};

export const isWithinCooldown = (lastSentAt, cooldownMinutes) => {
    if (!lastSentAt) return false;
    const cooldownMs = cooldownMinutes * 60 * 1000;
    return Date.now() - lastSentAt.getTime() < cooldownMs;
};

export const getRemainingCooldownSeconds = (lastSentAt, cooldownMinutes) => {
    if (!lastSentAt) return 0;
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const elapsed = Date.now() - lastSentAt.getTime();
    const remaining = cooldownMs - elapsed;
    return Math.max(0, Math.ceil(remaining / 1000));
};  

// Helper to generate unique warehouse code
export const generateWarehouseCode = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // e.g. 20250928
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase(); // 5 random chars
  return `WH-${datePart}-${randomPart}`;
};