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

  async populateShortCodePool(codes = []) {
    this.logger.info(this.logPrefix, 'Populating short code pool...', { codeCount: codes.length })
    
    if (!this.isConnected || !this.client) {
      this.logger.warn(this.logPrefix, 'Redis not connected, skipping pool population')
      return false
    }

    if (codes.length === 0) {
      this.logger.warn(this.logPrefix, 'No codes provided for pool population')
      return false
    }

    // Add codes to the pool in batches for performance
    const batchSize = 1000
    let addedCount = 0

    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize)
      
      const [error, result] = await __(this.client.lPush(this.shortCodePoolKey, ...batch))
      
      if (error) {
        this.logger.error(this.logPrefix, 'Failed to add codes to pool', { 
          batch: Math.floor(i / batchSize) + 1, 
          error: error.message 
        })
        throw error
      }
      
      addedCount += batch.length
      
      if (i % (batchSize * 10) === 0) {
        this.logger.debug(this.logPrefix, 'Pool population progress', { 
          added: addedCount, 
          total: codes.length 
        })
      }
    }
    
    this.logger.info(this.logPrefix, 'Short code pool populated successfully', { 
      addedCount, 
      totalRequested: codes.length 
    })
    
    return true
  }

  async getShortCode() {
    const startTime = Date.now()
    
    if (!this.isConnected || !this.client) {
      this.logger.debug(this.logPrefix, 'Redis not connected, generating fallback short code')
      return {
        code: this._generateFallbackShortCode(),
        source: 'fallback',
        responseTime: Date.now() - startTime
      }
    }

    this.logger.debug(this.logPrefix, 'Getting short code from pool')
    
    // Try to get short code with retry logic
    const maxRetries = 3
    let lastError
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const [error, shortCode] = await __(this.client.lPop(this.shortCodePoolKey))
      
      if (!error && shortCode) {
        const responseTime = Date.now() - startTime
        
        // Get remaining pool size for monitoring
        const [sizeError, poolSize] = await __(this.getPoolSize())
        const remainingPoolSize = sizeError ? 'unknown' : poolSize
        
        this.logger.debug(this.logPrefix, 'Retrieved short code from pool', { 
          shortCode, 
          responseTime,
          remainingPoolSize,
          attempt
        })
        
        // Check if pool is running low
        if (!sizeError && poolSize <= (parseInt(process.env.SHORT_CODE_REPLENISH_THRESHOLD) || 5000)) {
          this.logger.warn(this.logPrefix, 'Short code pool running low', { 
            remainingPoolSize: poolSize,
            threshold: parseInt(process.env.SHORT_CODE_REPLENISH_THRESHOLD) || 5000
          })
        }
        
        return {
          code: shortCode,
          source: 'redis_pool',
          responseTime,
          remainingPoolSize,
          attempt
        }
      }
      
      if (error) {
        lastError = error
        this.logger.warn(this.logPrefix, `Failed to get short code from pool (attempt ${attempt}/${maxRetries})`, { 
          error: error.message 
        })
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          const delay = Math.pow(2, attempt) * 100
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      } else {
        // No error but no short code means pool is empty
        this.logger.warn(this.logPrefix, 'No short codes available in pool, using fallback')
        break
      }
    }
    
    // All retries failed or pool is empty, use fallback
    const responseTime = Date.now() - startTime
    
    if (lastError) {
      this.logger.error(this.logPrefix, 'All attempts to get short code from pool failed, using fallback', { 
        error: lastError.message,
        attempts: maxRetries,
        responseTime
      })
    }
    
    return {
      code: this._generateFallbackShortCode(),
      source: 'fallback',
      responseTime,
      error: lastError ? lastError.message : 'pool_empty'
    }
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

  async getPoolSize() {
    if (!this.isConnected || !this.client) {
      this.logger.debug(this.logPrefix, 'Redis not connected, cannot get pool size')
      return 0
    }

    const [error, size] = await __(this.client.lLen(this.shortCodePoolKey))
    
    if (error) {
      this.logger.error(this.logPrefix, 'Failed to get pool size', { error: error.message })
      throw error
    }
    
    return size || 0
  }

  async addCodesToPool(codes) {
    if (!this.isConnected || !this.client) {
      this.logger.warn(this.logPrefix, 'Redis not connected, cannot add codes to pool')
      return false
    }

    if (!codes || codes.length === 0) {
      this.logger.debug(this.logPrefix, 'No codes provided to add to pool')
      return true
    }

    const [error] = await __(this.client.lPush(this.shortCodePoolKey, ...codes))
    
    if (error) {
      this.logger.error(this.logPrefix, 'Failed to add codes to pool', { 
        codeCount: codes.length, 
        error: error.message 
      })
      throw error
    }
    
    this.logger.debug(this.logPrefix, 'Added codes to pool', { codeCount: codes.length })
    return true
  }

  async removeCodesFromPool(codes) {
    if (!this.isConnected || !this.client) {
      this.logger.warn(this.logPrefix, 'Redis not connected, cannot remove codes from pool')
      return 0
    }

    if (!codes || codes.length === 0) {
      this.logger.debug(this.logPrefix, 'No codes provided to remove from pool')
      return 0
    }

    let removedCount = 0

    for (const code of codes) {
      const [error, count] = await __(this.client.lRem(this.shortCodePoolKey, 0, code))
      
      if (error) {
        this.logger.warn(this.logPrefix, 'Failed to remove code from pool', { 
          code, 
          error: error.message 
        })
        continue
      }
      
      removedCount += count || 0
    }
    
    this.logger.debug(this.logPrefix, 'Removed codes from pool', { 
      requestedCount: codes.length, 
      removedCount 
    })
    
    return removedCount
  }

  async getPoolStatistics() {
    if (!this.isConnected || !this.client) {
      return {
        connected: false,
        poolSize: 0,
        timestamp: new Date().toISOString()
      }
    }

    const [sizeError, poolSize] = await __(this.getPoolSize())
    
    const stats = {
      connected: this.isConnected,
      poolSize: sizeError ? 0 : poolSize,
      timestamp: new Date().toISOString(),
      poolKey: this.shortCodePoolKey
    }

    if (sizeError) {
      stats.error = sizeError.message
    }

    return stats
  }

  async clearPool() {
    if (!this.isConnected || !this.client) {
      this.logger.warn(this.logPrefix, 'Redis not connected, cannot clear pool')
      return false
    }

    const [error] = await __(this.client.del(this.shortCodePoolKey))
    
    if (error) {
      this.logger.error(this.logPrefix, 'Failed to clear pool', { error: error.message })
      throw error
    }
    
    this.logger.info(this.logPrefix, 'Short code pool cleared')
    return true
  }
}

export default RedisService