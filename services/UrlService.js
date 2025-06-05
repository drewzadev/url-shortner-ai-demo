import __ from '../libs/attempt.mjs'
import { appConfig } from '../config/app.js'
import { validateUrl, validateBulkUrls } from '../utils/validators.js'
import moment from 'moment'

/**
 * UrlService - Core business logic service for URL shortening operations
 * 
 * Handles all URL-related operations including creation, retrieval, deletion,
 * and click tracking. Integrates with DatabaseService for persistence and
 * RedisService for short code pool management and caching.
 */
class UrlService {
  /**
   * Create a new UrlService instance
   * 
   * @param {Object} database - DatabaseService instance for Prisma operations
   * @param {Object} redis - RedisService instance for caching and short code pool
   * @param {Object} logger - Winston logger instance for operational logging
   */
  constructor(database, redis, logger) {
    this.database = database
    this.redis = redis
    this.logger = logger
    this.logPrefix = 'UrlService'
    
    // Validate required dependencies
    if (!database) {
      throw new Error('UrlService requires a database service instance')
    }
    if (!redis) {
      throw new Error('UrlService requires a redis service instance')
    }
    if (!logger) {
      throw new Error('UrlService requires a logger instance')
    }
    
    this.logger.info(this.logPrefix, 'UrlService initialized with dependencies', {
      database: !!database,
      redis: !!redis,
      logger: !!logger
    })
  }

  /**
   * Calculate expiration date for a new URL
   * 
   * @param {number} monthsFromNow - Number of months from now (default: 6)
   * @returns {Date} Expiration date
   */
  _calculateExpirationDate(monthsFromNow = 6) {
    return moment().add(monthsFromNow, 'months').toDate()
  }

  /**
   * Create a single shortened URL
   * 
   * @param {string} originalUrl - The original URL to shorten
   * @returns {Object} Created URL object with short code and metadata
   */
  async createShortUrl(originalUrl) {
    this.logger.info(this.logPrefix, 'Creating short URL', { originalUrl })

    // Validate URL using the validators utility
    const validation = validateUrl(originalUrl)
    if (!validation.isValid) {
      this.logger.warn(this.logPrefix, 'URL validation failed', { 
        originalUrl, 
        error: validation.error,
        details: validation.details 
      })
      throw new Error(validation.error)
    }

    // Check database connectivity before proceeding
    const [dbHealthError] = await __(this._checkDatabaseHealth())
    if (dbHealthError) {
      this.logger.error(this.logPrefix, 'Database health check failed', dbHealthError)
      throw new Error('Database service unavailable')
    }

    // Get short code from pool with Redis failure handling
    const [shortCodeError, shortCodeResult] = await __(this._getShortCodeWithFallback())
    if (shortCodeError) {
      this.logger.error(this.logPrefix, 'Failed to get short code with fallback', shortCodeError)
      throw new Error('Failed to generate short code')
    }

    let shortCode = shortCodeResult.code
    this.logger.debug(this.logPrefix, 'Retrieved short code', { 
      shortCode, 
      source: shortCodeResult.source,
      redisAvailable: shortCodeResult.source !== 'fallback'
    })

    // Calculate expiration date
    const expiresAt = this._calculateExpirationDate(
      appConfig.url?.defaultExpirationMonths || 6
    )

    // Create URL in database with retry logic for unique constraint violations
    let attempts = 0
    const maxAttempts = 3
    let createdUrl

    while (attempts < maxAttempts) {
      attempts++
      
      const [createError, result] = await __(this.database.getClient().url.create({
        data: {
          originalUrl,
          shortCode,
          expiresAt
        }
      }))

      if (!createError) {
        createdUrl = result
        break
      }

      // Handle unique constraint violation (short code already exists)
      if (createError.code === 'P2002' && createError.meta?.target?.includes('shortCode')) {
        this.logger.warn(this.logPrefix, 'Short code collision, retrying', { 
          shortCode, 
          attempt: attempts 
        })
        
        if (attempts < maxAttempts) {
          // Get a new short code and try again
          const [retryShortCodeError, retryShortCodeResult] = await __(this._getShortCodeWithFallback())
          if (retryShortCodeError) {
            this.logger.error(this.logPrefix, 'Failed to get retry short code', retryShortCodeError)
            throw new Error('Failed to generate short code after collision')
          }
          shortCode = retryShortCodeResult.code
          continue
        }
      }

      // Handle database connection errors
      if (this._isDatabaseConnectionError(createError)) {
        this.logger.error(this.logPrefix, 'Database connection error during URL creation', createError)
        throw new Error('Database service unavailable')
      }

      this.logger.error(this.logPrefix, 'Failed to create URL in database', createError)
      throw new Error('Failed to create shortened URL')
    }

    if (!createdUrl) {
      this.logger.error(this.logPrefix, 'Failed to create URL after all attempts', { 
        attempts: maxAttempts 
      })
      throw new Error('Failed to create shortened URL after multiple attempts')
    }

    // Cache the URL mapping (graceful degradation if Redis fails)
    await this._cacheUrlGracefully(shortCode, originalUrl)

    this.logger.info(this.logPrefix, 'Successfully created short URL', {
      id: createdUrl.id,
      shortCode: createdUrl.shortCode,
      originalUrl: createdUrl.originalUrl,
      expiresAt: createdUrl.expiresAt
    })

    return {
      id: createdUrl.id,
      originalUrl: createdUrl.originalUrl,
      shortCode: createdUrl.shortCode,
      shortUrl: this._buildShortUrl(createdUrl.shortCode),
      createdAt: createdUrl.createdAt,
      expiresAt: createdUrl.expiresAt,
      clickCount: createdUrl.clickCount
    }
  }

  /**
   * Build complete short URL from short code
   * 
   * @param {string} shortCode - The short code
   * @returns {string} Complete short URL
   */
  _buildShortUrl(shortCode) {
    const baseUrl = appConfig.server?.baseUrl || `http://localhost:${appConfig.server?.port || 3000}`
    return `${baseUrl}/${shortCode}`
  }

  /**
   * Create multiple shortened URLs in a single transaction
   * 
   * @param {Array<string>} urls - Array of URLs to shorten
   * @returns {Object} Result object with successful and failed URLs
   */
  async createBulkShortUrls(urls) {
    this.logger.info(this.logPrefix, 'Creating bulk short URLs', { count: urls?.length })

    // Validate bulk URLs using the validators utility
    const validation = validateBulkUrls(urls)
    if (!validation.isValid) {
      this.logger.warn(this.logPrefix, 'Bulk URL validation failed', { 
        error: validation.error,
        details: validation.details,
        failedCount: validation.failedUrls?.length,
        totalCount: validation.totalCount
      })
      throw new Error(validation.error)
    }

    // Check database connectivity before proceeding
    const [dbHealthError] = await __(this._checkDatabaseHealth())
    if (dbHealthError) {
      this.logger.error(this.logPrefix, 'Database health check failed for bulk operation', dbHealthError)
      throw new Error('Database service unavailable')
    }

    // Get all needed short codes upfront with fallback handling
    const shortCodes = []
    for (let i = 0; i < urls.length; i++) {
      const [shortCodeError, shortCodeResult] = await __(this._getShortCodeWithFallback())
      if (shortCodeError) {
        this.logger.error(this.logPrefix, 'Failed to get short code for bulk operation', shortCodeError)
        throw new Error(`Failed to generate short code for URL at index ${i}`)
      }
      shortCodes.push(shortCodeResult.code)
    }

    this.logger.debug(this.logPrefix, 'Retrieved short codes for bulk operation', { 
      count: shortCodes.length 
    })

    // Calculate expiration date (same for all URLs in bulk)
    const expiresAt = this._calculateExpirationDate(
      appConfig.url?.defaultExpirationMonths || 6
    )

    // Prepare data for bulk creation
    const urlData = urls.map((originalUrl, index) => ({
      originalUrl,
      shortCode: shortCodes[index],
      expiresAt
    }))

    // Create all URLs in a single transaction with enhanced error handling
    const [transactionError, createdUrls] = await __(
      this.database.getClient().$transaction(async (prisma) => {
        const results = []
        
        for (const data of urlData) {
          const result = await prisma.url.create({ data })
          results.push(result)
        }
        
        return results
      })
    )

    if (transactionError) {
      this.logger.error(this.logPrefix, 'Bulk URL creation transaction failed', transactionError)
      
      // Handle database connection errors
      if (this._isDatabaseConnectionError(transactionError)) {
        throw new Error('Database service unavailable during bulk operation')
      }
      
      // Handle unique constraint violations specifically
      if (transactionError.code === 'P2002' && transactionError.meta?.target?.includes('shortCode')) {
        throw new Error('Short code collision occurred during bulk operation')
      }
      
      throw new Error('Failed to create bulk URLs: ' + transactionError.message)
    }

    // Cache all URLs (best effort - don't fail if caching fails)
    const cachePromises = createdUrls.map(async (url) => {
      await this._cacheUrlGracefully(url.shortCode, url.originalUrl)
    })

    // Wait for all cache operations to complete (but don't fail on cache errors)
    await Promise.allSettled(cachePromises)

    this.logger.info(this.logPrefix, 'Successfully created bulk short URLs', {
      count: createdUrls.length,
      shortCodes: createdUrls.map(url => url.shortCode)
    })

    // Format response with success/failure structure
    const successful = createdUrls.map(url => ({
      id: url.id,
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: this._buildShortUrl(url.shortCode),
      createdAt: url.createdAt,
      expiresAt: url.expiresAt,
      clickCount: url.clickCount
    }))

    return {
      successCount: successful.length,
      failureCount: 0,
      successful,
      failed: []
    }
  }

  /**
   * Retrieve URL details by short code with cache-first lookup
   * 
   * @param {string} shortCode - The short code to look up
   * @returns {Object|null} URL object if found, null if not found
   */
  async getUrlByShortCode(shortCode) {
    this.logger.debug(this.logPrefix, 'Getting URL by short code', { shortCode })

    if (!shortCode || typeof shortCode !== 'string') {
      throw new Error('Short code is required and must be a string')
    }

    // Check database connectivity before proceeding
    const [dbHealthError] = await __(this._checkDatabaseHealth())
    if (dbHealthError) {
      this.logger.error(this.logPrefix, 'Database health check failed', dbHealthError)
      throw new Error('Database service unavailable')
    }

    // First try to get from cache (graceful degradation if Redis fails)
    let cachedUrl = null
    if (this.redis && this.redis.isConnected) {
      const [cacheError, cachedResult] = await __(this.redis.getCachedUrl(shortCode))
      
      if (!cacheError && cachedResult) {
        cachedUrl = cachedResult
        this.logger.debug(this.logPrefix, 'URL found in cache', { shortCode })
      } else if (cacheError) {
        this.logger.warn(this.logPrefix, 'Cache lookup failed, falling back to database', { 
          shortCode, 
          error: cacheError.message 
        })
      }
    } else {
      this.logger.debug(this.logPrefix, 'Redis not available, checking database directly', { shortCode })
    }

    // Get full details from database (either for cache validation or direct lookup)
    const [dbError, urlFromDb] = await __(this.database.getClient().url.findUnique({
      where: { shortCode }
    }))

    if (dbError) {
      // Handle database connection errors
      if (this._isDatabaseConnectionError(dbError)) {
        this.logger.error(this.logPrefix, 'Database connection error while getting URL', dbError)
        throw new Error('Database service unavailable')
      }
      
      this.logger.error(this.logPrefix, 'Database error while getting URL', dbError)
      throw new Error('Failed to retrieve URL')
    }

    if (!urlFromDb) {
      this.logger.debug(this.logPrefix, 'URL not found', { shortCode })
      return null
    }

    // Check if URL has expired
    if (moment().isAfter(urlFromDb.expiresAt)) {
      this.logger.debug(this.logPrefix, 'URL has expired', { 
        shortCode, 
        expiresAt: urlFromDb.expiresAt 
      })
      return null
    }

    // Cache the URL for future requests (graceful degradation if Redis fails)
    if (!cachedUrl) {
      await this._cacheUrlGracefully(shortCode, urlFromDb.originalUrl)
    }

    this.logger.debug(this.logPrefix, 'URL found and retrieved', { 
      shortCode, 
      originalUrl: urlFromDb.originalUrl,
      cacheHit: !!cachedUrl
    })

    return {
      id: urlFromDb.id,
      originalUrl: urlFromDb.originalUrl,
      shortCode: urlFromDb.shortCode,
      shortUrl: this._buildShortUrl(urlFromDb.shortCode),
      createdAt: urlFromDb.createdAt,
      expiresAt: urlFromDb.expiresAt,
      clickCount: urlFromDb.clickCount
    }
  }

  /**
   * Delete a URL by short code
   * 
   * @param {string} shortCode - The short code of the URL to delete
   * @returns {boolean} True if deleted, false if not found
   */
  async deleteUrl(shortCode) {
    this.logger.info(this.logPrefix, 'Deleting URL', { shortCode })

    if (!shortCode || typeof shortCode !== 'string') {
      throw new Error('Short code is required and must be a string')
    }

    // Check database connectivity before proceeding
    const [dbHealthError] = await __(this._checkDatabaseHealth())
    if (dbHealthError) {
      this.logger.error(this.logPrefix, 'Database health check failed for deletion', dbHealthError)
      throw new Error('Database service unavailable')
    }

    // First check if the URL exists
    const [findError, existingUrl] = await __(this.database.getClient().url.findUnique({
      where: { shortCode }
    }))

    if (findError) {
      // Handle database connection errors
      if (this._isDatabaseConnectionError(findError)) {
        this.logger.error(this.logPrefix, 'Database connection error while checking URL existence', findError)
        throw new Error('Database service unavailable')
      }
      
      this.logger.error(this.logPrefix, 'Database error while checking URL existence', findError)
      throw new Error('Failed to delete URL')
    }

    if (!existingUrl) {
      this.logger.debug(this.logPrefix, 'URL not found for deletion', { shortCode })
      return false
    }

    // Delete from database
    const [deleteError] = await __(this.database.getClient().url.delete({
      where: { shortCode }
    }))

    if (deleteError) {
      // Handle database connection errors
      if (this._isDatabaseConnectionError(deleteError)) {
        this.logger.error(this.logPrefix, 'Database connection error during deletion', deleteError)
        throw new Error('Database service unavailable')
      }
      
      this.logger.error(this.logPrefix, 'Failed to delete URL from database', deleteError)
      throw new Error('Failed to delete URL')
    }

    // Remove from cache (graceful degradation - don't fail if cache removal fails)
    await this._removeCachedUrlGracefully(shortCode)

    this.logger.info(this.logPrefix, 'Successfully deleted URL', { 
      shortCode, 
      originalUrl: existingUrl.originalUrl 
    })

    return true
  }

  /**
   * Retrieve all URLs from the database
   * 
   * @returns {Array<Object>} Array of all URL objects
   */
  async getAllUrls() {
    this.logger.debug(this.logPrefix, 'Getting all URLs')

    // Check database connectivity before proceeding
    const [dbHealthError] = await __(this._checkDatabaseHealth())
    if (dbHealthError) {
      this.logger.error(this.logPrefix, 'Database health check failed for getAllUrls', dbHealthError)
      throw new Error('Database service unavailable')
    }

    const [error, urls] = await __(this.database.getClient().url.findMany({
      orderBy: { createdAt: 'desc' }
    }))

    if (error) {
      // Handle database connection errors
      if (this._isDatabaseConnectionError(error)) {
        this.logger.error(this.logPrefix, 'Database connection error while retrieving URLs', error)
        throw new Error('Database service unavailable')
      }
      
      this.logger.error(this.logPrefix, 'Failed to retrieve all URLs', error)
      throw new Error('Failed to retrieve URLs')
    }

    this.logger.debug(this.logPrefix, 'Retrieved all URLs', { count: urls.length })

    // Format response and filter out expired URLs
    const now = moment()
    const activeUrls = urls
      .filter(url => now.isBefore(url.expiresAt))
      .map(url => ({
        id: url.id,
        originalUrl: url.originalUrl,
        shortCode: url.shortCode,
        shortUrl: this._buildShortUrl(url.shortCode),
        createdAt: url.createdAt,
        expiresAt: url.expiresAt,
        clickCount: url.clickCount
      }))

    this.logger.debug(this.logPrefix, 'Filtered active URLs', { 
      total: urls.length, 
      active: activeUrls.length 
    })

    return activeUrls
  }

  /**
   * Increment click count for a URL
   * 
   * @param {string} shortCode - The short code of the URL to increment
   * @returns {number} New click count, or null if URL not found
   */
  async incrementClickCount(shortCode) {
    this.logger.debug(this.logPrefix, 'Incrementing click count', { shortCode })

    if (!shortCode || typeof shortCode !== 'string') {
      throw new Error('Short code is required and must be a string')
    }

    // Check database connectivity before proceeding
    const [dbHealthError] = await __(this._checkDatabaseHealth())
    if (dbHealthError) {
      this.logger.error(this.logPrefix, 'Database health check failed for click increment', dbHealthError)
      throw new Error('Database service unavailable')
    }

    const [error, updatedUrl] = await __(this.database.getClient().url.update({
      where: { shortCode },
      data: {
        clickCount: {
          increment: 1
        }
      }
    }))

    if (error) {
      // Check if URL was not found
      if (error.code === 'P2025') {
        this.logger.debug(this.logPrefix, 'URL not found for click increment', { shortCode })
        return null
      }
      
      // Handle database connection errors
      if (this._isDatabaseConnectionError(error)) {
        this.logger.error(this.logPrefix, 'Database connection error during click increment', error)
        throw new Error('Database service unavailable')
      }
      
      this.logger.error(this.logPrefix, 'Failed to increment click count', error)
      throw new Error('Failed to increment click count')
    }

    this.logger.debug(this.logPrefix, 'Successfully incremented click count', { 
      shortCode, 
      newClickCount: updatedUrl.clickCount 
    })

    return updatedUrl.clickCount
  }

  /**
   * Get short code with graceful Redis failure handling
   * Falls back to generating codes locally if Redis is unavailable
   * 
   * @returns {Object} Short code result with source information
   */
  async _getShortCodeWithFallback() {
    // First try Redis if available
    if (this.redis && this.redis.isConnected) {
      try {
        const result = await this.redis.getShortCode()
        this.logger.debug(this.logPrefix, 'Successfully got short code from Redis', {
          source: result.source,
          responseTime: result.responseTime
        })
        return result
      } catch (error) {
        this.logger.warn(this.logPrefix, 'Redis getShortCode failed, falling back to local generation', {
          error: error.message
        })
        // Continue to fallback below
      }
    } else {
      this.logger.debug(this.logPrefix, 'Redis not connected, using local short code generation')
    }

    // Fallback to local generation
    const fallbackCode = this._generateFallbackShortCode()
    return {
      code: fallbackCode,
      source: 'local_fallback',
      responseTime: 0,
      redisUnavailable: true
    }
  }

  /**
   * Generate a fallback short code when Redis is unavailable
   * 
   * @returns {string} Generated short code
   */
  _generateFallbackShortCode() {
    const chars = appConfig.shortCode?.charset || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const length = appConfig.shortCode?.length || 6
    let result = ''
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    
    return result
  }

  /**
   * Cache URL with graceful degradation - doesn't fail if Redis is unavailable
   * 
   * @param {string} shortCode - Short code to cache
   * @param {string} originalUrl - Original URL to cache
   */
  async _cacheUrlGracefully(shortCode, originalUrl) {
    if (!this.redis || !this.redis.isConnected) {
      this.logger.debug(this.logPrefix, 'Redis not available, skipping URL caching', { shortCode })
      return
    }

    const [cacheError] = await __(this.redis.cacheUrl(
      shortCode, 
      originalUrl, 
      appConfig.url?.cacheTtlSeconds || 3600
    ))
    
    if (cacheError) {
      this.logger.warn(this.logPrefix, 'Failed to cache URL, continuing without cache', { 
        shortCode, 
        error: cacheError.message 
      })
    } else {
      this.logger.debug(this.logPrefix, 'Successfully cached URL', { shortCode })
    }
  }

  /**
   * Remove URL from cache with graceful degradation
   * 
   * @param {string} shortCode - Short code to remove from cache
   */
  async _removeCachedUrlGracefully(shortCode) {
    if (!this.redis || !this.redis.isConnected) {
      this.logger.debug(this.logPrefix, 'Redis not available, skipping cache removal', { shortCode })
      return
    }

    const [cacheError] = await __(this.redis.removeCachedUrl(shortCode))
    
    if (cacheError) {
      this.logger.warn(this.logPrefix, 'Failed to remove URL from cache, continuing', { 
        shortCode, 
        error: cacheError.message 
      })
    } else {
      this.logger.debug(this.logPrefix, 'Successfully removed URL from cache', { shortCode })
    }
  }

  /**
   * Check database health with timeout
   * 
   * @returns {Promise} Resolves if healthy, rejects if unhealthy
   */
  async _checkDatabaseHealth() {
    if (!this.database || !this.database.isConnected) {
      throw new Error('Database service not connected')
    }

    // Use database health check with timeout
    const healthCheckTimeout = appConfig.database?.healthCheckTimeout || 5000
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database health check timeout')), healthCheckTimeout)
    })

    const healthPromise = this.database.healthCheck()
    
    return Promise.race([healthPromise, timeoutPromise])
  }

  /**
   * Check if error is a database connection error
   * 
   * @param {Error} error - Error to check
   * @returns {boolean} True if it's a connection error
   */
  _isDatabaseConnectionError(error) {
    const connectionErrorCodes = [
      'P1001', // Can't reach database server
      'P1002', // Database server unreachable  
      'P1003', // Database file doesn't exist
      'P1008', // Operations timed out
      'P1017'  // Server closed connection
    ]
    
    const connectionErrorMessages = [
      'connection',
      'timeout',
      'unreachable',
      'refused',
      'closed'
    ]

    return connectionErrorCodes.includes(error.code) ||
           connectionErrorMessages.some(msg => 
             error.message?.toLowerCase().includes(msg)
           )
  }
}

export default UrlService 