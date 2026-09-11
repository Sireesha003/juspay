/**
 * UUID validation utility
 * Validates if a string is a valid UUID format
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID
 * @param {string} uuid - The string to validate
 * @returns {boolean} - True if valid UUID, false otherwise
 */
export const isValidUUID = (uuid) => {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }
  return UUID_REGEX.test(uuid);
};

/**
 * Validates UUID and throws error if invalid
 * @param {string} uuid - The string to validate
 * @param {string} fieldName - Name of the field for error message
 * @throws {Error} - If UUID is invalid
 */
export const validateUUID = (uuid, fieldName = 'ID') => {
  if (!isValidUUID(uuid)) {
    throw new Error(`Invalid ${fieldName} format. Expected a valid UUID.`);
  }
  return true;
};

