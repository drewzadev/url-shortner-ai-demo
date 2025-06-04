import redis from 'redis'
import __ from '../libs/attempt.mjs'
import logger from '../config/logger.js'

class RedisService {
  constructor() {
    this.client = null
    this.isConnected = false
    this.logPrefix = 'RedisService'
    this.logger = logger
    this.shortCodePoolKey = 'url_shortener:short_codes'
    this.urlCachePrefix = 'url_shortener:cache:'
  }

  async connect() {
    const maxRetries = 3
    let lastError

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const [error, client] = await __(this._createConnection())
      
      if (!error) {
        this.client = client
        this.isConnected = true
        this.logger.info(this.logPrefix, `Connected to Redis successfully on attempt ${attempt}`)
        return
      }

      lastError = error
      this.logger.warn(this.logPrefix, `Redis connection attempt ${attempt} failed: ${error.message}`)
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    this.logger.error(this.logPrefix, `Failed to connect to Redis after ${maxRetries} attempts: ${lastError.message}`)
    throw lastError
  }

  async _createConnection() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    
    const client = redis.createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 3000,
        commandTimeout: 5000,
        lazyConnect: true,
        reconnectDelayOnFailure: () => 1000,
        maxRetriesPerRequest: 1
      },
      retryDelayOnFailover: 100,
      enableOfflineQueue: false
    })

    client.on('error', (err) => {
      if (err.code !== 'ECONNREFUSED' && err.code !== 'ENOTFOUND') {
        this.logger.warn(this.logPrefix, 'Redis client error:', err.message)
      }
      this.isConnected = false
    })

    client.on('connect', () => {
      this.logger.debug(this.logPrefix, 'Redis client connected')
    })

    client.on('ready', () => {
      this.logger.info(this.logPrefix, 'Redis client ready')
      this.isConnected = true
    })

    client.on('end', () => {
      this.logger.info(this.logPrefix, 'Redis client connection ended')
      this.isConnected = false
    })

    // Add connection timeout
    const connectPromise = client.connect()
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Redis connection timeout after 3 seconds')), 3000)
    })

    await Promise.race([connectPromise, timeoutPromise])
    return client
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      const [error] = await __(this.client.quit())
      if (error) {
        this.logger.error(this.logPrefix, 'Error disconnecting from Redis', error)
        throw error
      }
      
      this.client = null
      this.isConnected = false
      this.logger.info(this.logPrefix, 'Disconnected from Redis')
    }
  }

  async populateShortCodePool() {
    this.logger.info(this.logPrefix, 'Populating short code pool...')
    
    // TODO: Implement short code pool population
    // For now, just log that it's not implemented
    this.logger.warn(this.logPrefix, 'Short code pool population not yet implemented')
    
    return true
  }

  async getShortCode() {
    if (!this.isConnected || !this.client) {
      this.logger.debug(this.logPrefix, 'Redis not connected, generating fallback short code')
      // Generate a simple fallback short code
      return this._generateFallbackShortCode()
    }

    this.logger.debug(this.logPrefix, 'Getting short code from pool')
    
    // TODO: Implement getting short code from Redis pool
    this.logger.warn(this.logPrefix, 'Getting short code from pool not yet implemented, using fallback')
    
    return this._generateFallbackShortCode()
  }

  _generateFallbackShortCode() {
    // Simple fallback short code generation
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    const length = parseInt(process.env.SHORT_CODE_LENGTH) || 5
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    
    return result
  }

  async cacheUrl(shortCode, originalUrl, ttlSeconds = 3600) {
    if (!this.isConnected || !this.client) {
      this.logger.debug(this.logPrefix, 'Redis not connected, skipping cache operation')
      return
    }

    const [error] = await __(this.client.setEx(
      `${this.urlCachePrefix}${shortCode}`,
      ttlSeconds,
      originalUrl
    ))
    
    if (error) {
      this.logger.warn(this.logPrefix, 'Failed to cache URL, continuing without cache', { shortCode, error: error.message })
      return
    }
    
    this.logger.debug(this.logPrefix, 'URL cached successfully', { shortCode })
  }

  async getCachedUrl(shortCode) {
    if (!this.isConnected || !this.client) {
      this.logger.debug(this.logPrefix, 'Redis not connected, skipping cache lookup')
      return null
    }

    const [error, cachedUrl] = await __(this.client.get(`${this.urlCachePrefix}${shortCode}`))
    
    if (error) {
      this.logger.warn(this.logPrefix, 'Failed to get cached URL, continuing without cache', { shortCode, error: error.message })
      return null
    }
    
    if (cachedUrl) {
      this.logger.debug(this.logPrefix, 'URL found in cache', { shortCode })
    }
    
    return cachedUrl
  }

  async removeCachedUrl(shortCode) {
    const [error] = await __(this.client.del(`${this.urlCachePrefix}${shortCode}`))
    
    if (error) {
      this.logger.error(this.logPrefix, 'Failed to remove cached URL', { shortCode, error })
      throw error
    }
    
    this.logger.debug(this.logPrefix, 'URL removed from cache', { shortCode })
  }

  async healthCheck() {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis client not connected')
    }

    const [error, result] = await __(this.client.ping())
    
    if (error) {
      this.logger.error(this.logPrefix, 'Redis health check failed', error)
      throw error
    }
    
    return result === 'PONG'
  }
}

export default RedisService