// utils/userUtils.js
import { prisma } from '../config/prismaClient.js'

/**
 * Generate a unique invite referral code based on user's name
 * Format: First letter + Second letter + Random 5-digit number
 * 
 * @param {string|null} name - User's name (can be null if name not available yet)
 * @returns {Promise<string>} - Unique invite referral code
 */
export const generateInviteRefCode = async (name) => {
  // Handle edge cases for name
  let firstLetter = 'X'
  let secondLetter = 'X'

  if (name && name.trim().length > 0) {
    const trimmedName = name.trim().toUpperCase()
    firstLetter = trimmedName[0]
    // If name has only one character, use it twice
    secondLetter = trimmedName.length > 1 ? trimmedName[1] : trimmedName[0]
  }

  // Generate random 5-digit number (10000 to 99999)
  const randomNumber = Math.floor(10000 + Math.random() * 90000).toString()

  // Combine: first letter + second letter + 5-digit number
  let inviteRefCode = `${firstLetter}${secondLetter}${randomNumber}`

  // Ensure uniqueness by checking database
  let isUnique = false
  let attempts = 0
  const maxAttempts = 10

  while (!isUnique && attempts < maxAttempts) {
    const existing = await prisma.user.findUnique({
      where: { inviteRefCode },
      select: { id: true }
    })

    if (!existing) {
      isUnique = true
    } else {
      // If code exists, generate a new random number
      const newRandomNumber = Math.floor(10000 + Math.random() * 90000).toString()
      inviteRefCode = `${firstLetter}${secondLetter}${newRandomNumber}`
      attempts++
    }
  }

  if (!isUnique) {
    // Fallback: if still not unique after max attempts, append timestamp
    const timestamp = Date.now().toString().slice(-4)
    inviteRefCode = `${firstLetter}${secondLetter}${timestamp}${Math.floor(Math.random() * 10)}`
  }

  return inviteRefCode
}

