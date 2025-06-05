import createLogger from './logger.js'
import { DatabaseService } from './database.js'
import { RedisService } from './redis.js'
import __ from './attempt.mjs'

export async function createCoreServices() {
  const logger = createLogger()
  
  const database = new DatabaseService(logger)
  const redis = new RedisService(logger)
  
  // Connect both services
  const [dbError] = await __(database.connect())
  if (dbError) {
    logger.error('Bootstrap', 'Failed to connect to database', dbError)
    throw dbError
  }
  
  const [redisError] = await __(redis.connect())
  if (redisError) {
    logger.error('Bootstrap', 'Failed to connect to Redis', redisError)
    throw redisError
  }
  
  logger.info('Bootstrap', 'Core services initialized successfully')
  
  return { logger, database, redis }
}

export async function shutdownCoreServices({ logger, database, redis }) {
  const [dbError] = await __(database.disconnect())
  if (dbError) {
    logger.error('Bootstrap', 'Error disconnecting database', dbError)
  }
  
  const [redisError] = await __(redis.disconnect())
  if (redisError) {
    logger.error('Bootstrap', 'Error disconnecting Redis', redisError)
  }
  
  logger.info('Bootstrap', 'Core services shutdown completed')
} 