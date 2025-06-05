import __ from '../libs/attempt.mjs'
import ShortCodeService from './ShortCodeService.js'
import { appConfig } from '../config/app.js'

class ShortCodePoolService {
  constructor(database, redis, logger) {
    this.logPrefix = 'ShortCodePoolService'
    this.logger = logger
    this.database = database
    this.redis = redis
    
    this.shortCodeService = new ShortCodeService(logger)
    
    // Configuration from centralized config
    this.poolSize = appConfig.shortCode.poolSize
    this.minPoolSize = appConfig.shortCode.minPoolSize
    this.replenishThreshold = appConfig.shortCode.replenishThreshold
    this.batchSize = appConfig.shortCode.batchSize
    
    this.isInitialized = false
    this.isReplenishing = false
    
    this.logger.info(this.logPrefix, 'Initialized with configuration', {
      poolSize: this.poolSize,
      minPoolSize: this.minPoolSize,
      replenishThreshold: this.replenishThreshold,
      batchSize: this.batchSize
    })
  }

  async initialize() {
    if (this.isInitialized) {
      this.logger.debug(this.logPrefix, 'Pool service already initialized')
      return
    }

    this.logger.info(this.logPrefix, 'Initializing short code pool service...')
    
    // Ensure Redis is connected
    if (!this.redis.isConnected) {
      const [connectError] = await __(this.redis.connect())
      if (connectError) {
        this.logger.error(this.logPrefix, 'Failed to connect to Redis for pool initialization', connectError)
        throw connectError
      }
    }

    // Check current pool size and populate if needed
    const [sizeError, currentSize] = await __(this.getCurrentPoolSize())
    if (sizeError) {
      this.logger.error(this.logPrefix, 'Failed to get current pool size', sizeError)
      throw sizeError
    }

    this.logger.info(this.logPrefix, 'Current pool status', { currentSize, targetSize: this.poolSize })

    if (currentSize < this.minPoolSize) {
      this.logger.info(this.logPrefix, 'Pool size below minimum, starting reconciliation and population')
      await this.reconcileAndPopulatePool()
    } else {
      this.logger.info(this.logPrefix, 'Pool size adequate, performing reconciliation only')
      await this.reconcilePool()
    }

    this.isInitialized = true
    this.logger.info(this.logPrefix, 'Pool service initialization completed')
  }

  async getCurrentPoolSize() {
    return await this.redis.getPoolSize()
  }

  async getUsedShortCodes() {
    if (!this.database.isConnected) {
      this.logger.warn(this.logPrefix, 'Database not connected, cannot retrieve used codes')
      return []
    }

    const [error, urls] = await __(this.database.getClient().url.findMany({
      select: { shortCode: true }
    }))

    if (error) {
      this.logger.error(this.logPrefix, 'Failed to retrieve used short codes from database', error)
      throw error
    }

    return urls.map(url => url.shortCode)
  }

  async reconcilePool() {
    this.logger.info(this.logPrefix, 'Starting pool reconciliation...')
    
    const startTime = Date.now()
    
    // Get used codes from database
    const [usedCodesError, usedCodes] = await __(this.getUsedShortCodes())
    if (usedCodesError) {
      this.logger.error(this.logPrefix, 'Failed to get used codes for reconciliation', usedCodesError)
      throw usedCodesError
    }

    this.logger.info(this.logPrefix, 'Retrieved used codes from database', { usedCount: usedCodes.length })

    if (usedCodes.length === 0) {
      this.logger.info(this.logPrefix, 'No used codes found, reconciliation complete')
      return { removedCount: 0, duration: Date.now() - startTime }
    }

    // Remove used codes from pool
    const [removeError, removedCount] = await __(this.redis.removeCodesFromPool(usedCodes))
    if (removeError) {
      this.logger.error(this.logPrefix, 'Failed to remove used codes from pool', removeError)
      throw removeError
    }

    const duration = Date.now() - startTime
    
    this.logger.info(this.logPrefix, 'Pool reconciliation completed', {
      usedCodesChecked: usedCodes.length,
      removedFromPool: removedCount,
      durationMs: duration
    })

    return { removedCount, duration }
  }

  async populatePool(targetSize = null) {
    const actualTargetSize = targetSize || this.poolSize
    
    this.logger.info(this.logPrefix, 'Starting pool population...', { targetSize: actualTargetSize })
    
    const startTime = Date.now()
    
    // Get current pool size
    const [sizeError, currentSize] = await __(this.getCurrentPoolSize())
    if (sizeError) {
      this.logger.error(this.logPrefix, 'Failed to get current pool size', sizeError)
      throw sizeError
    }

    const neededCodes = actualTargetSize - currentSize
    
    if (neededCodes <= 0) {
      this.logger.info(this.logPrefix, 'Pool already at target size', { currentSize, targetSize: actualTargetSize })
      return { generatedCount: 0, addedCount: 0, duration: Date.now() - startTime }
    }

    this.logger.info(this.logPrefix, 'Generating codes for pool', { 
      currentSize, 
      targetSize: actualTargetSize, 
      neededCodes 
    })

    // Get used codes to exclude from generation
    const [usedCodesError, usedCodes] = await __(this.getUsedShortCodes())
    if (usedCodesError) {
      this.logger.warn(this.logPrefix, 'Could not get used codes, proceeding without exclusion', usedCodesError)
    }

    const excludeSet = usedCodesError ? new Set() : new Set(usedCodes)

    // Generate new codes
    const progressCallback = (progress) => {
      if (progress.batch % 10 === 0) {
        this.logger.debug(this.logPrefix, 'Code generation progress', progress)
      }
    }

    const [generateError, newCodes] = await __(this.shortCodeService.generateShortCodesBatch(
      neededCodes, 
      excludeSet, 
      progressCallback
    ))

    if (generateError) {
      this.logger.error(this.logPrefix, 'Failed to generate short codes', generateError)
      throw generateError
    }

    this.logger.info(this.logPrefix, 'Generated new codes', { 
      requested: neededCodes, 
      generated: newCodes.length 
    })

    // Add codes to Redis pool
    const [addError] = await __(this.redis.populateShortCodePool(newCodes))
    if (addError) {
      this.logger.error(this.logPrefix, 'Failed to add codes to Redis pool', addError)
      throw addError
    }

    const duration = Date.now() - startTime
    
    this.logger.info(this.logPrefix, 'Pool population completed', {
      generatedCount: newCodes.length,
      addedCount: newCodes.length,
      durationMs: duration,
      finalPoolSize: currentSize + newCodes.length
    })

    return { 
      generatedCount: newCodes.length, 
      addedCount: newCodes.length, 
      duration 
    }
  }

  async reconcileAndPopulatePool() {
    this.logger.info(this.logPrefix, 'Starting reconciliation and population process...')
    
    const startTime = Date.now()
    
    // First reconcile (remove used codes)
    const [reconcileError, reconcileResult] = await __(this.reconcilePool())
    if (reconcileError) {
      this.logger.error(this.logPrefix, 'Reconciliation failed during reconcile and populate', reconcileError)
      throw reconcileError
    }

    // Then populate to target size
    const [populateError, populateResult] = await __(this.populatePool())
    if (populateError) {
      this.logger.error(this.logPrefix, 'Population failed during reconcile and populate', populateError)
      throw populateError
    }

    const duration = Date.now() - startTime
    
    this.logger.info(this.logPrefix, 'Reconciliation and population completed', {
      reconcileResult,
      populateResult,
      totalDurationMs: duration
    })

    return {
      reconcileResult,
      populateResult,
      duration
    }
  }

  async checkAndReplenishPool() {
    if (this.isReplenishing) {
      this.logger.debug(this.logPrefix, 'Pool replenishment already in progress, skipping')
      return
    }

    const [sizeError, currentSize] = await __(this.getCurrentPoolSize())
    if (sizeError) {
      this.logger.error(this.logPrefix, 'Failed to check pool size for replenishment', sizeError)
      return
    }

    if (currentSize <= this.replenishThreshold) {
      this.logger.info(this.logPrefix, 'Pool size below replenishment threshold, starting replenishment', {
        currentSize,
        threshold: this.replenishThreshold
      })

      this.isReplenishing = true
      
      try {
        await this.populatePool()
      } catch (error) {
        this.logger.error(this.logPrefix, 'Pool replenishment failed', error)
      } finally {
        this.isReplenishing = false
      }
    }
  }

  async getPoolStatistics() {
    const [redisStatsError, redisStats] = await __(this.redis.getPoolStatistics())
    const [usedCodesError, usedCodes] = await __(this.getUsedShortCodes())
    
    const codeSpaceStats = this.shortCodeService.getCodeSpaceStatistics(
      redisStatsError ? 0 : redisStats.poolSize
    )

    return {
      redis: redisStatsError ? { connected: false, error: redisStatsError.message } : redisStats,
      database: {
        connected: this.database.isConnected,
        usedCodesCount: usedCodesError ? 0 : usedCodes.length,
        error: usedCodesError ? usedCodesError.message : null
      },
      pool: {
        targetSize: this.poolSize,
        minSize: this.minPoolSize,
        replenishThreshold: this.replenishThreshold,
        isReplenishing: this.isReplenishing,
        isInitialized: this.isInitialized
      },
      codeSpace: codeSpaceStats,
      timestamp: new Date().toISOString()
    }
  }

  async clearPool() {
    this.logger.info(this.logPrefix, 'Clearing short code pool...')
    
    const [error] = await __(this.redis.clearPool())
    if (error) {
      this.logger.error(this.logPrefix, 'Failed to clear pool', error)
      throw error
    }

    this.logger.info(this.logPrefix, 'Pool cleared successfully')
    return true
  }

  async shutdown() {
    this.logger.info(this.logPrefix, 'Shutting down pool service...')
    
    this.isInitialized = false
    this.isReplenishing = false
    
    // Redis service shutdown is handled by the main application
    this.logger.info(this.logPrefix, 'Pool service shutdown completed')
  }
}

export default ShortCodePoolService