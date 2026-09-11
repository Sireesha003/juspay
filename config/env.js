// config/env.js
import dotenv from 'dotenv'

dotenv.config() // Load environment variables from .env file

// Critical environment variables that must be set
const requiredEnvVars = [
  'DATABASE_URL' // Required by Prisma - PostgreSQL connection string
]

// Check for required environment variables
const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar])

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:')
  missingVars.forEach((envVar) => {
    console.error(`   - ${envVar}`)
  })
  console.error('\n💡 Solution: Create a .env file in the root directory')
  console.error('   You can copy .env.example to .env and fill in the values')
  process.exit(1) // Exit the process if a variable is missing
}

// Optional: Warn about important but not critical variables in production
if (process.env.NODE_ENV === 'production') {
  const importantVars = [
    'FRONTEND_URL',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'S3_BUCKET_NAME',
    'RAZORPAY_WEBHOOK_SECRET' // CRITICAL: Separate webhook secret for security
  ]

  const missingImportant = importantVars.filter(
    (envVar) => !process.env[envVar]
  )
  if (missingImportant.length > 0) {
    console.warn(
      '⚠️  Warning: Some important environment variables are not set:'
    )
    missingImportant.forEach((envVar) => {
      console.warn(`   - ${envVar}`)
    })
  }
}

export default process.env // Export all environment variables
