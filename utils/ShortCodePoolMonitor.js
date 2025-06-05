import __ from '../libs/attempt.mjs'
import { appConfig } from '../config/app.js'

class ShortCodePoolMonitor {
  constructor(redis, logger) {
    this.logPrefix = 'ShortCodePoolMonitor'
    this.logger = logger
    this.redis = redis
    
    // Note: We'll get poolService injected later or create it with dependencies
    this.poolService = null
    
    // Configuration from centralized config
    this.monitoringInterval = parseInt(process.env.POOL_MONITORING_INTERVAL_MS) || 60000 // 1 minute
    this.replenishThreshold = appConfig.shortCode.replenishThreshold
    this.criticalThreshold = parseInt(process.env.SHORT_CODE_CRITICAL_THRESHOLD) || 1000
    
    this.monitoringTimer = null
    this.isMonitoring = false
    this.lastHealthCheck = null
    this.metrics = {
      poolSize: 0,
      retrievalCount: 0,
      fallbackCount: 0,
      replenishmentCount: 0,
      lastReplenishment: null,
      errors: []
    }
    
    this.logger.debug(this.logPrefix, 'Initialized with configuration', {
      monitoringInterval: this.monitoringInterval,
      replenishThreshold: this.replenishThreshold,
      criticalThreshold: this.criticalThreshold
    })
  }

  // Set the pool service after it's created with proper dependencies
  setPoolService(poolService) {
    this.poolService = poolService
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      this.logger.debug(this.logPrefix, 'Monitoring already active')
      return
    }

    this.logger.info(this.logPrefix, 'Starting pool monitoring...', {
      interval: this.monitoringInterval
    })

    this.isMonitoring = true
    
    // Initial health check
    await this.performHealthCheck()
    
    // Set up periodic monitoring
    this.monitoringTimer = setInterval(async () => {
      try {
        await this.performHealthCheck()
      } catch (error) {
        this.logger.error(this.logPrefix, 'Error during periodic health check', error)
      }
    }, this.monitoringInterval)

    this.logger.info(this.logPrefix, 'Pool monitoring started successfully')
  }

  async stopMonitoring() {
    if (!this.isMonitoring) {
      this.logger.debug(this.logPrefix, 'Monitoring not active')
      return
    }

    this.logger.info(this.logPrefix, 'Stopping pool monitoring...')

    this.isMonitoring = false
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer)
      this.monitoringTimer = null
    }

    this.logger.info(this.logPrefix, 'Pool monitoring stopped')
  }

  async performHealthCheck() {
    const startTime = Date.now()
    
    try {
      const [statsError, stats] = await __(this.poolService.getPoolStatistics())
      
      if (statsError) {
        this.logger.error(this.logPrefix, 'Failed to get pool statistics during health check', statsError)
        this.recordError(statsError)
        return this.createHealthResult('unhealthy', { error: statsError.message })
      }

      const poolSize = stats.redis.poolSize || 0
      this.metrics.poolSize = poolSize

      // Determine health status
      let status = 'healthy'
      let alerts = []
      let actions = []

      if (!stats.redis.connected) {
        status = 'unhealthy'
        alerts.push('Redis not connected')
      } else if (poolSize <= this.criticalThreshold) {
        status = 'critical'
        alerts.push(`Pool size critically low: ${poolSize}`)
        actions.push('immediate_replenishment_required')
      } else if (poolSize <= this.replenishThreshold) {
        status = 'warning'
        alerts.push(`Pool size below threshold: ${poolSize}`)
        actions.push('replenishment_recommended')
      }

      if (!stats.database.connected) {
        if (status === 'healthy') status = 'degraded'
        alerts.push('Database not connected')
      }

      // Check if replenishment is needed and not already in progress
      if (actions.includes('immediate_replenishment_required') || 
          actions.includes('replenishment_recommended')) {
        if (!stats.pool.isReplenishing) {
          this.logger.info(this.logPrefix, 'Triggering pool replenishment', {
            currentSize: poolSize,
            threshold: this.replenishThreshold,
            status
          })
          
          // Trigger replenishment in background
          this.triggerReplenishment()
        }
      }

      const healthResult = this.createHealthResult(status, {
        poolSize,
        alerts,
        actions,
        stats,
        responseTime: Date.now() - startTime
      })

      this.lastHealthCheck = healthResult

      // Log based on status
      if (status === 'critical') {
        this.logger.error(this.logPrefix, 'Pool health check: CRITICAL', healthResult)
      } else if (status === 'warning') {
        this.logger.warn(this.logPrefix, 'Pool health check: WARNING', healthResult)
      } else if (status === 'unhealthy' || status === 'degraded') {
        this.logger.warn(this.logPrefix, `Pool health check: ${status.toUpperCase()}`, healthResult)
      } else {
        this.logger.debug(this.logPrefix, 'Pool health check: HEALTHY', {
          poolSize,
          responseTime: healthResult.responseTime
        })
      }

      return healthResult

    } catch (error) {
      this.logger.error(this.logPrefix, 'Health check failed with exception', error)
      this.recordError(error)
      return this.createHealthResult('unhealthy', { 
        error: error.message,
        responseTime: Date.now() - startTime
      })
    }
  }

  async triggerReplenishment() {
    try {
      this.metrics.replenishmentCount++
      this.metrics.lastReplenishment = new Date().toISOString()
      
      const [error] = await __(this.poolService.checkAndReplenishPool())
      
      if (error) {
        this.logger.error(this.logPrefix, 'Pool replenishment failed', error)
        this.recordError(error)
      } else {
        this.logger.info(this.logPrefix, 'Pool replenishment completed successfully')
      }
    } catch (error) {
      this.logger.error(this.logPrefix, 'Exception during pool replenishment', error)
      this.recordError(error)
    }
  }

  createHealthResult(status, data = {}) {
    return {
      status,
      timestamp: new Date().toISOString(),
      service: 'short_code_pool',
      ...data
    }
  }

  recordError(error) {
    this.metrics.errors.push({
      error: error.message,
      timestamp: new Date().toISOString(),
      stack: error.stack
    })

    // Keep only last 10 errors
    if (this.metrics.errors.length > 10) {
      this.metrics.errors = this.metrics.errors.slice(-10)
    }
  }

  recordRetrieval(source) {
    this.metrics.retrievalCount++
    
    if (source === 'fallback') {
      this.metrics.fallbackCount++
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      monitoring: {
        isActive: this.isMonitoring,
        interval: this.monitoringInterval,
        lastHealthCheck: this.lastHealthCheck
      },
      thresholds: {
        replenish: this.replenishThreshold,
        critical: this.criticalThreshold
      },
      fallbackRate: this.metrics.retrievalCount > 0 
        ? (this.metrics.fallbackCount / this.metrics.retrievalCount) * 100 
        : 0
    }
  }

  resetMetrics() {
    this.logger.info(this.logPrefix, 'Resetting metrics')
    
    this.metrics = {
      poolSize: 0,
      retrievalCount: 0,
      fallbackCount: 0,
      replenishmentCount: 0,
      lastReplenishment: null,
      errors: []
    }
  }

  async getDetailedStatus() {
    const [statsError, poolStats] = await __(this.poolService.getPoolStatistics())
    const [healthError, healthStatus] = await __(this.performHealthCheck())
    
    return {
      health: healthError ? { status: 'error', error: healthError.message } : healthStatus,
      statistics: statsError ? { error: statsError.message } : poolStats,
      metrics: this.getMetrics(),
      monitoring: {
        active: this.isMonitoring,
        interval: this.monitoringInterval
      }
    }
  }

  async checkPoolLevel() {
    const [sizeError, poolSize] = await __(this.redis.getPoolSize())
    
    if (sizeError) {
      return {
        status: 'error',
        error: sizeError.message
      }
    }

    let level = 'adequate'
    let recommendation = 'none'

    if (poolSize <= this.criticalThreshold) {
      level = 'critical'
      recommendation = 'immediate_replenishment'
    } else if (poolSize <= this.replenishThreshold) {
      level = 'low'
      recommendation = 'schedule_replenishment'
    }

    return {
      status: 'success',
      poolSize,
      level,
      recommendation,
      thresholds: {
        critical: this.criticalThreshold,
        replenish: this.replenishThreshold
      }
    }
  }
}

export default ShortCodePoolMonitor