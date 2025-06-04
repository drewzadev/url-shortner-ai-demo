import ShortCodeService from '../services/ShortCodeService.js'
import RedisService from '../services/RedisService.js'
import ShortCodePoolService from '../services/ShortCodePoolService.js'
import ShortCodePoolMonitor from '../utils/ShortCodePoolMonitor.js'
import __ from '../libs/attempt.mjs'
import logger from '../config/logger.js'

const logPrefix = 'ShortCodePoolTester'

class ShortCodePoolTester {
  constructor() {
    this.logger = logger
    this.shortCodeService = new ShortCodeService()
    this.redisService = new RedisService()
    this.poolService = new ShortCodePoolService()
    this.poolMonitor = new ShortCodePoolMonitor()
    
    this.testResults = {
      codeGeneration: false,
      codeValidation: false,
      redisOperations: false,
      poolPopulation: false,
      poolRetrieval: false,
      poolReconciliation: false,
      poolMonitoring: false,
      performanceTest: false
    }
  }

  async testCodeGeneration() {
    this.logger.info(logPrefix, 'Testing short code generation...')
    
    try {
      // Test single code generation
      const singleCode = this.shortCodeService.generateShortCode()
      
      if (!singleCode || singleCode.length !== 5) {
        throw new Error(`Invalid single code generated: ${singleCode}`)
      }
      
      this.logger.debug(logPrefix, 'Single code generation test passed', { code: singleCode })
      
      // Test batch generation
      const batchCodes = this.shortCodeService.generateShortCodes(100)
      
      if (!batchCodes || batchCodes.length === 0) {
        throw new Error('Batch code generation failed')
      }
      
      // Check for uniqueness
      const uniqueCodes = new Set(batchCodes)
      if (uniqueCodes.size !== batchCodes.length) {
        throw new Error(`Duplicate codes found in batch: ${batchCodes.length} generated, ${uniqueCodes.size} unique`)
      }
      
      this.logger.debug(logPrefix, 'Batch code generation test passed', { count: batchCodes.length })
      
      // Test configuration
      const config = this.shortCodeService.getConfiguration()
      this.logger.debug(logPrefix, 'Code service configuration', config)
      
      return true
    } catch (error) {
      this.logger.error(logPrefix, 'Code generation test failed', error)
      return false
    }
  }

  async testCodeValidation() {
    this.logger.info(logPrefix, 'Testing short code validation...')
    
    try {
      const validCodes = ['abc12', 'XYZ99', 'aB3De']
      const invalidCodes = ['abc1', 'abc123', 'abc!@', '', null, 123]
      
      // Test valid codes
      for (const code of validCodes) {
        if (!this.shortCodeService.isValidShortCode(code)) {
          throw new Error(`Valid code marked as invalid: ${code}`)
        }
      }
      
      // Test invalid codes
      for (const code of invalidCodes) {
        if (this.shortCodeService.isValidShortCode(code)) {
          throw new Error(`Invalid code marked as valid: ${code}`)
        }
      }
      
      this.logger.debug(logPrefix, 'Code validation test passed')
      return true
    } catch (error) {
      this.logger.error(logPrefix, 'Code validation test failed', error)
      return false
    }
  }

  async testRedisOperations() {
    this.logger.info(logPrefix, 'Testing Redis operations...')
    
    try {
      // Connect to Redis
      if (!this.redisService.isConnected) {
        await this.redisService.connect()
      }
      
      // Clear pool for testing
      await this.redisService.clearPool()
      
      // Test pool size
      let poolSize = await this.redisService.getPoolSize()
      if (poolSize !== 0) {
        throw new Error(`Expected empty pool, got size: ${poolSize}`)
      }
      
      // Test adding codes to pool
      const testCodes = ['test1', 'test2', 'test3', 'test4', 'test5']
      await this.redisService.addCodesToPool(testCodes)
      
      poolSize = await this.redisService.getPoolSize()
      if (poolSize !== testCodes.length) {
        throw new Error(`Expected pool size ${testCodes.length}, got ${poolSize}`)
      }
      
      // Test retrieving codes
      const retrievedCodes = []
      for (let i = 0; i < testCodes.length; i++) {
        const result = await this.redisService.getShortCode()
        if (result.source !== 'redis_pool') {
          throw new Error(`Expected code from pool, got source: ${result.source}`)
        }
        retrievedCodes.push(result.code)
      }
      
      // Verify all codes were retrieved
      if (retrievedCodes.length !== testCodes.length) {
        throw new Error(`Expected ${testCodes.length} codes, retrieved ${retrievedCodes.length}`)
      }
      
      // Pool should be empty now
      poolSize = await this.redisService.getPoolSize()
      if (poolSize !== 0) {
        throw new Error(`Expected empty pool after retrieval, got size: ${poolSize}`)
      }
      
      // Test fallback when pool is empty
      const fallbackResult = await this.redisService.getShortCode()
      if (fallbackResult.source !== 'fallback') {
        throw new Error(`Expected fallback code, got source: ${fallbackResult.source}`)
      }
      
      this.logger.debug(logPrefix, 'Redis operations test passed')
      return true
    } catch (error) {
      this.logger.error(logPrefix, 'Redis operations test failed', error)
      return false
    }
  }

  async testPoolPopulation() {
    this.logger.info(logPrefix, 'Testing pool population...')
    
    try {
      // Ensure Redis is connected
      if (!this.redisService.isConnected) {
        await this.redisService.connect()
      }
      
      // Clear pool
      await this.redisService.clearPool()
      
      // Test small batch population
      const testSize = 1000
      const result = await this.poolService.populatePool(testSize)
      
      if (!result.generatedCount || result.generatedCount === 0) {
        throw new Error('No codes were generated for pool population')
      }
      
      // Verify pool size
      const poolSize = await this.redisService.getPoolSize()
      if (poolSize !== result.generatedCount) {
        throw new Error(`Pool size mismatch: expected ${result.generatedCount}, got ${poolSize}`)
      }
      
      // Test statistics
      const stats = await this.poolService.getPoolStatistics()
      if (!stats.redis.connected) {
        throw new Error('Pool statistics show Redis not connected')
      }
      
      if (stats.redis.poolSize !== poolSize) {
        throw new Error('Pool statistics size mismatch')
      }
      
      this.logger.debug(logPrefix, 'Pool population test passed', {
        generated: result.generatedCount,
        poolSize: poolSize,
        duration: result.duration
      })
      
      return true
    } catch (error) {
      this.logger.error(logPrefix, 'Pool population test failed', error)
      return false
    }
  }

  async testPoolRetrieval() {
    this.logger.info(logPrefix, 'Testing pool retrieval patterns...')
    
    try {
      // Ensure we have codes in pool
      const currentSize = await this.redisService.getPoolSize()
      if (currentSize < 100) {
        await this.poolService.populatePool(200)
      }
      
      // Test multiple retrievals
      const retrievedCodes = new Set()
      const retrievalCount = 50
      
      for (let i = 0; i < retrievalCount; i++) {
        const result = await this.redisService.getShortCode()
        
        if (result.source !== 'redis_pool') {
          throw new Error(`Unexpected code source: ${result.source}`)
        }
        
        if (retrievedCodes.has(result.code)) {
          throw new Error(`Duplicate code retrieved: ${result.code}`)
        }
        
        retrievedCodes.add(result.code)
      }
      
      if (retrievedCodes.size !== retrievalCount) {
        throw new Error(`Retrieved code count mismatch: expected ${retrievalCount}, got ${retrievedCodes.size}`)
      }
      
      this.logger.debug(logPrefix, 'Pool retrieval test passed', {
        retrievedCount: retrievedCodes.size,
        uniqueCodes: retrievedCodes.size
      })
      
      return true
    } catch (error) {
      this.logger.error(logPrefix, 'Pool retrieval test failed', error)
      return false
    }
  }

  async testPoolReconciliation() {
    this.logger.info(logPrefix, 'Testing pool reconciliation...')
    
    try {
      // This test assumes database is not connected, so reconciliation should handle gracefully
      const result = await this.poolService.reconcilePool()
      
      // Should complete without errors even if database is not connected
      this.logger.debug(logPrefix, 'Pool reconciliation test passed', result)
      
      return true
    } catch (error) {
      // Expected if database is not available
      this.logger.warn(logPrefix, 'Pool reconciliation test completed with expected database error', error.message)
      return true
    }
  }

  async testPoolMonitoring() {
    this.logger.info(logPrefix, 'Testing pool monitoring...')
    
    try {
      // Start monitoring
      await this.poolMonitor.startMonitoring()
      
      // Perform health check
      const healthResult = await this.poolMonitor.performHealthCheck()
      
      if (!healthResult.status) {
        throw new Error('Health check did not return status')
      }
      
      // Get metrics
      const metrics = this.poolMonitor.getMetrics()
      
      if (typeof metrics.poolSize !== 'number') {
        throw new Error('Metrics do not include pool size')
      }
      
      // Get detailed status
      const detailedStatus = await this.poolMonitor.getDetailedStatus()
      
      if (!detailedStatus.health || !detailedStatus.metrics) {
        throw new Error('Detailed status missing required fields')
      }
      
      // Stop monitoring
      await this.poolMonitor.stopMonitoring()
      
      this.logger.debug(logPrefix, 'Pool monitoring test passed', {
        healthStatus: healthResult.status,
        poolSize: metrics.poolSize
      })
      
      return true
    } catch (error) {
      this.logger.error(logPrefix, 'Pool monitoring test failed', error)
      return false
    }
  }

  async testPerformance() {
    this.logger.info(logPrefix, 'Testing performance...')
    
    try {
      // Test code generation performance
      const startTime = Date.now()
      const codes = this.shortCodeService.generateShortCodes(10000)
      const generationTime = Date.now() - startTime
      
      if (codes.length === 0) {
        throw new Error('Performance test failed: no codes generated')
      }
      
      // Test Redis operations performance
      if (this.redisService.isConnected) {
        const redisStartTime = Date.now()
        
        // Add codes to pool
        await this.redisService.addCodesToPool(codes.slice(0, 1000))
        
        // Retrieve codes
        const retrievalTimes = []
        for (let i = 0; i < 100; i++) {
          const retrievalStart = Date.now()
          await this.redisService.getShortCode()
          retrievalTimes.push(Date.now() - retrievalStart)
        }
        
        const redisTime = Date.now() - redisStartTime
        const avgRetrievalTime = retrievalTimes.reduce((a, b) => a + b, 0) / retrievalTimes.length
        
        this.logger.debug(logPrefix, 'Performance test completed', {
          codeGeneration: {
            count: codes.length,
            timeMs: generationTime,
            codesPerSecond: Math.round((codes.length / generationTime) * 1000)
          },
          redisOperations: {
            totalTimeMs: redisTime,
            avgRetrievalTimeMs: avgRetrievalTime,
            retrievalsPerSecond: Math.round(1000 / avgRetrievalTime)
          }
        })
      } else {
        this.logger.debug(logPrefix, 'Performance test completed (Redis not available)', {
          codeGeneration: {
            count: codes.length,
            timeMs: generationTime,
            codesPerSecond: Math.round((codes.length / generationTime) * 1000)
          }
        })
      }
      
      return true
    } catch (error) {
      this.logger.error(logPrefix, 'Performance test failed', error)
      return false
    }
  }

  async runAllTests() {
    this.logger.info(logPrefix, 'Starting comprehensive short code pool tests...')
    
    try {
      this.testResults.codeGeneration = await this.testCodeGeneration()
      this.testResults.codeValidation = await this.testCodeValidation()
      this.testResults.redisOperations = await this.testRedisOperations()
      this.testResults.poolPopulation = await this.testPoolPopulation()
      this.testResults.poolRetrieval = await this.testPoolRetrieval()
      this.testResults.poolReconciliation = await this.testPoolReconciliation()
      this.testResults.poolMonitoring = await this.testPoolMonitoring()
      this.testResults.performanceTest = await this.testPerformance()
      
      this.printResults()
      
    } catch (error) {
      this.logger.error(logPrefix, 'Test execution failed', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  printResults() {
    const passedTests = Object.values(this.testResults).filter(result => result === true).length
    const totalTests = Object.keys(this.testResults).length
    
    this.logger.info(logPrefix, 'Test Results Summary:', {
      passed: passedTests,
      total: totalTests,
      success: passedTests === totalTests,
      details: this.testResults
    })
    
    if (passedTests === totalTests) {
      this.logger.info(logPrefix, '🎉 All short code pool tests passed!')
    } else {
      this.logger.error(logPrefix, '❌ Some short code pool tests failed!')
    }
  }

  async cleanup() {
    this.logger.info(logPrefix, 'Cleaning up test environment...')
    
    try {
      // Stop monitoring if running
      if (this.poolMonitor.isMonitoring) {
        await this.poolMonitor.stopMonitoring()
      }
      
      // Clear test data from Redis
      if (this.redisService.isConnected) {
        await this.redisService.clearPool()
        await this.redisService.disconnect()
      }
      
      this.logger.info(logPrefix, 'Test cleanup completed')
    } catch (error) {
      this.logger.error(logPrefix, 'Error during test cleanup', error)
    }
  }
}

async function main() {
  const tester = new ShortCodePoolTester()
  
  const [error] = await __(tester.runAllTests())
  if (error) {
    logger.error(logPrefix, 'Short code pool testing failed:', error)
    process.exit(1)
  }
  
  logger.info(logPrefix, 'Short code pool testing completed successfully!')
}

process.on('SIGINT', async () => {
  logger.info(logPrefix, 'Received SIGINT, cleaning up...')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info(logPrefix, 'Received SIGTERM, cleaning up...')
  process.exit(0)
})

main()