import RedisService from '../services/RedisService.js'
import __ from '../libs/attempt.mjs'
import logger from './logger.js'

class RedisConfig {
  constructor() {
    this.redisService = null
    this.isInitialized = false
    this.logPrefix = 'RedisConfig'
    this.logger = logger
  }

  async initialize() {
    if (this.isInitialized) {
      return this.redisService
    }

    const [error, service] = await __(this._createRedisService())
    if (error) {
      this.logger.error(this.logPrefix, 'Failed to initialize Redis service', error)
      throw error
    }

    this.redisService = service
    this.isInitialized = true
    this.logger.info(this.logPrefix, 'Redis service initialized successfully')
    
    return this.redisService
  }

  async _createRedisService() {
    const service = new RedisService()
    await service.connect()
    
    // Test connection
    await service.healthCheck()
    
    return service
  }

  async shutdown() {
    if (this.redisService && this.isInitialized) {
      const [error] = await __(this.redisService.disconnect())
      if (error) {
        this.logger.error(this.logPrefix, 'Error shutting down Redis service', error)
        throw error
      }
      
      this.redisService = null
      this.isInitialized = false
      this.logger.info(this.logPrefix, 'Redis service shutdown completed')
    }
  }

  getService() {
    if (!this.isInitialized || !this.redisService) {
      throw new Error('Redis service not initialized')
    }
    return this.redisService
  }

  async healthCheck() {
    if (!this.isInitialized || !this.redisService) {
      throw new Error('Redis service not initialized')
    }
    
    return await this.redisService.healthCheck()
  }
}

// Create singleton instance
const redisConfig = new RedisConfig()

export default redisConfig
export { RedisConfig }