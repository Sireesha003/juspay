// jobs/startJobProcessors.js
import logger from '../utils/logger.js'
import './orderStatusProcessor.js' // This registers the processor
import './subscriptionProcessor.js' // Register subscription processor

logger.info('[Jobs] Job processors started')

